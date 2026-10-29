-- Aplicada à mão no SQL Editor em 29/10/2026 (MCP desconectado): não consta em supabase_migrations do remoto.
-- Chamada por hora-aula: cadastro de alunos, matrícula na turma e presença por aula.
-- Só cria objetos novos; não altera nada da agenda.
begin;

-- ---------- alunos (existem sem turma; entram numa turma depois) ----------
create table public.alunos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (length(trim(nome)) > 0),
  email      text check (email = lower(email)),   -- e-mail institucional
  codigo     text,                                 -- CodAluno do sistema do Senac
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  constraint alunos_email_unico unique (email),
  constraint alunos_codigo_unico unique (codigo)
);

-- ---------- matrícula: aluno × turma ----------
create table public.matriculas (
  turma_id   uuid not null references public.turmas (id),
  aluno_id   uuid not null references public.alunos (id),
  situacao   text not null default 'normal' check (situacao in ('normal', 'desligado')),
  created_at timestamptz not null default now(),
  primary key (turma_id, aluno_id)
);
create index matriculas_aluno_idx on public.matriculas (aluno_id);

-- ---------- presença: uma posição por hora-aula (true = compareceu) ----------
-- Sem cascade: aula com chamada não pode ser apagada.
create table public.presencas (
  item_id    uuid not null references public.itens (id),
  aluno_id   uuid not null references public.alunos (id),
  horas      boolean[] not null check (cardinality(horas) between 1 and 24),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (item_id, aluno_id)
);
create index presencas_aluno_idx on public.presencas (aluno_id);
create index presencas_updated_by_idx on public.presencas (updated_by);

-- Quantas presenças tem a aula: duração ÷ hora-aula do curso (60 ou 50 min), arredondado, no mínimo 1.
create or replace function private.horas_chamada(p_ini time, p_fim time, p_hora_aula integer)
returns integer language sql immutable set search_path = '' as $$
  select greatest(1, round(extract(epoch from p_fim - p_ini) / 60 / p_hora_aula))::integer;
$$;
grant execute on function private.horas_chamada(time, time, integer) to authenticated;

-- Instrutor (dono da aula) ou gestor grava a chamada. Só a partir do dia da aula, só alunos da turma.
-- p_registros = [{aluno_id, horas: [bool, ...]}]
create or replace function public.salvar_chamada(p_item uuid, p_registros jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_item public.itens; v_n integer; v_reg jsonb; v_aluno uuid; v_horas boolean[];
begin
  select * into v_item from public.itens where id = p_item;
  if v_item.id is null or v_item.tipo <> 'aula' then raise exception 'Aula não encontrada.'; end if;
  if v_item.instrutor_id is distinct from auth.uid() and not private.e_gestor() then
    raise exception 'Só o instrutor da aula (ou a coordenação) faz a chamada.';
  end if;
  if v_item.data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A chamada abre no dia da aula.';
  end if;
  select private.horas_chamada(v_item.hora_inicio, v_item.hora_fim, c.hora_aula_min) into v_n
  from public.turmas t join public.cursos c on c.id = t.curso_id where t.id = v_item.turma_id;

  for v_reg in select * from jsonb_array_elements(coalesce(p_registros, '[]'::jsonb)) loop
    v_aluno := (v_reg->>'aluno_id')::uuid;
    if not exists (select 1 from public.matriculas m where m.turma_id = v_item.turma_id and m.aluno_id = v_aluno) then
      raise exception 'Há aluno na chamada que não está matriculado na turma.';
    end if;
    v_horas := array(select x::boolean from jsonb_array_elements_text(v_reg->'horas') with ordinality as e(x, n) order by n);
    if cardinality(v_horas) <> v_n then
      raise exception 'A chamada desta aula tem % hora(s)-aula; recarregue a tela.', v_n;
    end if;
    insert into public.presencas (item_id, aluno_id, horas, updated_by)
    values (p_item, v_aluno, v_horas, auth.uid())
    on conflict (item_id, aluno_id) do update
      set horas = excluded.horas, updated_at = now(), updated_by = excluded.updated_by
      where public.presencas.horas is distinct from excluded.horas;
  end loop;
end;
$$;
revoke all on function public.salvar_chamada(uuid, jsonb) from public, anon;
grant execute on function public.salvar_chamada(uuid, jsonb) to authenticated;

-- Auditoria da chamada no mesmo histórico da aula (antes/depois trazem o aluno_id).
create or replace function private.presencas_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.historico (item_id, operacao, antes, depois, feito_por)
  values (coalesce(new.item_id, old.item_id), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end;
$$;
create trigger presencas_audit after insert or update or delete on public.presencas
  for each row execute function private.presencas_audit();

-- ---------- views (security_invoker: cada um vê o que o RLS permite) ----------
-- Resumo por aula: se a chamada foi feita e quantas faltas (em horas-aula).
create view public.chamadas with (security_invoker = on) as
select p.item_id,
       count(*)::int as alunos,
       sum(cardinality(p.horas))::int as horas,
       sum((select count(*) from unnest(p.horas) h where not h))::int as faltas,
       max(p.updated_at) as feita_em
from public.presencas p
group by p.item_id;

-- Frequência por turma × aluno (faltas em horas-aula).
create view public.frequencia with (security_invoker = on) as
select i.turma_id, p.aluno_id,
       count(*)::int as aulas,
       sum(cardinality(p.horas))::int as horas,
       sum((select count(*) from unnest(p.horas) h where not h))::int as faltas
from public.presencas p join public.itens i on i.id = p.item_id
group by i.turma_id, p.aluno_id;

-- ---------- RLS ----------
alter table public.alunos     enable row level security;
alter table public.matriculas enable row level security;
alter table public.presencas  enable row level security;

revoke all on public.alunos, public.matriculas, public.presencas, public.chamadas, public.frequencia from anon;
grant select on public.chamadas, public.frequencia to authenticated;

-- gestor: tudo; instrutor: só os alunos das turmas em que dá aula
create policy matriculas_select on public.matriculas for select to authenticated
  using ((select private.e_gestor()) or turma_id in (select private.minhas_turmas()));
create policy matriculas_insert on public.matriculas for insert to authenticated with check ((select private.e_gestor()));
create policy matriculas_update on public.matriculas for update to authenticated
  using ((select private.e_gestor())) with check ((select private.e_gestor()));
create policy matriculas_delete on public.matriculas for delete to authenticated using ((select private.e_gestor()));

create policy alunos_select on public.alunos for select to authenticated
  using ((select private.e_gestor())
         or id in (select m.aluno_id from public.matriculas m where m.turma_id in (select private.minhas_turmas())));
create policy alunos_insert on public.alunos for insert to authenticated with check ((select private.e_gestor()));
create policy alunos_update on public.alunos for update to authenticated
  using ((select private.e_gestor())) with check ((select private.e_gestor()));
create policy alunos_delete on public.alunos for delete to authenticated using ((select private.e_gestor()));

-- presença: lê quem vê a aula (RLS de itens); grava só pela salvar_chamada
create policy presencas_select on public.presencas for select to authenticated
  using ((select private.e_gestor()) or exists (select 1 from public.itens i where i.id = item_id));

commit;
