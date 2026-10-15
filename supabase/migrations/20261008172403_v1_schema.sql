-- =============================================================
-- v1 — cursos, UCs, turmas, usuários e itens da agenda
-- Regras (sobreposição, jornada do RH, coerência da aula) ficam aqui.
-- As tabelas da v0 (agenda, compromissos, editores) não são tocadas.
-- =============================================================

create extension if not exists btree_gist with schema extensions;

-- ---------- usuários (substitui editores) ----------
create table public.usuarios (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null unique check (email = lower(email)),
  nome       text not null,
  papel      text not null check (papel in ('admin', 'tept', 'instrutor')),
  leciona    boolean not null default false,
  cor        text not null default '#004A8D' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  constraint usuarios_instrutor_leciona check (papel <> 'instrutor' or leciona)
);
comment on table public.usuarios is 'Quem acessa o sistema. admin/tept = gestor; leciona = aparece como instrutor.';

-- ---------- cursos e UCs (vêm do plano de curso) ----------
create table public.cursos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  eixo          text,
  segmento      text,
  ch_total      numeric(7, 2) not null check (ch_total > 0),
  codigo_dn     text,
  cbo           text,
  hora_aula_min integer not null default 60 check (hora_aula_min in (50, 60)),
  ativo         boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.ucs (
  id            uuid primary key default gen_random_uuid(),
  curso_id      uuid not null references public.cursos (id) on delete cascade,
  numero        integer not null check (numero > 0),
  nome          text not null,
  ch            numeric(6, 2) not null check (ch > 0),
  tipo          text not null default 'regular' check (tipo in ('regular', 'projeto_integrador')),
  indicadores   text[] not null default '{}',
  conhecimentos text[] not null default '{}',
  habilidades   text[] not null default '{}',
  atitudes      text[] not null default '{}',
  integra       integer[] not null default '{}',  -- PI: números das UCs do bloco
  constraint ucs_numero_unico unique (curso_id, numero)
);
create index ucs_curso_idx on public.ucs (curso_id);

-- ---------- turmas ----------
create table public.turmas (
  id          uuid primary key default gen_random_uuid(),
  curso_id    uuid not null references public.cursos (id),
  codigo      text unique check (codigo ~ '^\d{9}$'),
  nome        text not null,
  cor         text not null default '#004A8D' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  data_inicio date,
  data_fim    date,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint turmas_periodo check (data_fim is null or data_inicio is null or data_fim >= data_inicio)
);
create index turmas_curso_idx on public.turmas (curso_id);

-- ---------- itens da agenda (aulas e eventos avulsos) ----------
create table public.itens (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('aula', 'evento')),
  data         date not null,
  hora_inicio  time not null,
  hora_fim     time not null,
  turno        text generated always as (
                 case when hora_inicio < time '12:00' then 'M'
                      when hora_inicio < time '18:00' then 'T'
                      else 'N' end) stored,
  periodo      tsrange generated always as (tsrange(data + hora_inicio, data + hora_fim, '[)')) stored,
  instrutor_id uuid not null references public.usuarios (id),
  turma_id     uuid references public.turmas (id),
  uc_id        uuid references public.ucs (id),
  titulo       text,
  cor          text check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  trabalho     boolean not null default true,   -- false: férias/feriado/folga (ocupa, não conta jornada)
  observacao   text,
  material_ok  boolean not null default false,
  ptd_ok       boolean not null default false,
  serie_id     uuid,                            -- itens lançados juntos (repetição)
  origem       text not null default 'v1' check (origem in ('v1', 'v0')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null,
  constraint itens_horario check (hora_fim > hora_inicio),
  constraint itens_campos_por_tipo check (
    (tipo = 'aula' and turma_id is not null and uc_id is not null and titulo is null and trabalho)
    or (tipo = 'evento' and turma_id is null and uc_id is null and length(trim(coalesce(titulo, ''))) > 0)
  ),
  constraint itens_sem_choque_instrutor exclude using gist (instrutor_id with =, periodo with &&),
  constraint itens_sem_choque_turma exclude using gist (turma_id with =, periodo with &&) where (turma_id is not null)
);
create index itens_data_idx on public.itens (data);
create index itens_instrutor_data_idx on public.itens (instrutor_id, data);
create index itens_turma_uc_idx on public.itens (turma_id, uc_id);
create index itens_serie_idx on public.itens (serie_id) where serie_id is not null;
create index itens_updated_by_idx on public.itens (updated_by);
create index itens_uc_idx on public.itens (uc_id);

-- ---------- histórico ----------
create table public.historico (
  id        bigint generated always as identity primary key,
  item_id   uuid not null,
  operacao  text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  antes     jsonb,
  depois    jsonb,
  feito_por uuid,
  feito_em  timestamptz not null default now()
);
create index historico_item_idx on public.historico (item_id, feito_em desc);

-- =============================================================
-- Funções de acesso
-- =============================================================
create or replace function private.papel()
returns text language sql stable security definer set search_path = '' as $$
  select u.papel from public.usuarios u where u.id = auth.uid() and u.ativo;
$$;

create or replace function private.e_gestor()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.papel() in ('admin', 'tept'), false);
$$;

create or replace function private.e_usuario()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.papel() is not null;
$$;

-- turmas em que o usuário logado dá (ou deu) aula — security definer evita recursão no RLS de itens
create or replace function private.minhas_turmas()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct i.turma_id from public.itens i
  where i.instrutor_id = auth.uid() and i.turma_id is not null;
$$;

revoke all on function private.papel(), private.e_gestor(), private.e_usuario(), private.minhas_turmas() from public;
grant execute on function private.papel(), private.e_gestor(), private.e_usuario(), private.minhas_turmas() to authenticated;

-- =============================================================
-- Regras da agenda
-- =============================================================
create or replace function private.fmt_h(i interval)
returns text language sql immutable set search_path = '' as $$
  select case when extract(minute from i) = 0 then extract(hour from i)::int || ' h'
              else extract(hour from i)::int || ' h ' || lpad(extract(minute from i)::int::text, 2, '0') end;
$$;

-- Jornada do RH num dia (máx. 10 h de trabalho; interjornada mínima de 11 h com os dias vizinhos).
-- Considera os itens gravados (menos p_ignorar) mais um candidato opcional. Devolve o motivo ou null.
create or replace function private.motivo_jornada(
  p_instrutor uuid, p_data date,
  p_ini time default null, p_fim time default null, p_trabalho boolean default true,
  p_ignorar uuid default null)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_total interval; v_ini timestamp; v_fim timestamp; v_fim_ant timestamp; v_ini_prox timestamp;
begin
  with base as (
    select i.data, i.hora_inicio, i.hora_fim from public.itens i
    where i.instrutor_id = p_instrutor and i.trabalho
      and i.data between p_data - 1 and p_data + 1
      and i.id is distinct from p_ignorar
    union all
    select p_data, p_ini, p_fim where p_ini is not null and p_trabalho
  )
  select sum(hora_fim - hora_inicio) filter (where data = p_data),
         min(data + hora_inicio) filter (where data = p_data),
         max(data + hora_fim) filter (where data = p_data),
         max(data + hora_fim) filter (where data = p_data - 1),
         min(data + hora_inicio) filter (where data = p_data + 1)
    into v_total, v_ini, v_fim, v_fim_ant, v_ini_prox
  from base;

  if v_ini is null then return null; end if;
  if v_total > interval '10 hours' then
    return format('%s: a jornada do dia ficaria com %s (limite do RH: 10 h por dia).',
                  to_char(p_data, 'DD/MM'), private.fmt_h(v_total));
  end if;
  if v_fim_ant is not null and v_ini - v_fim_ant < interval '11 hours' then
    return format('%s: só %s de descanso desde o fim do dia anterior (%s); o RH exige 11 h.',
                  to_char(p_data, 'DD/MM'), private.fmt_h(v_ini - v_fim_ant), to_char(v_fim_ant, 'HH24:MI'));
  end if;
  if v_ini_prox is not null and v_ini_prox - v_fim < interval '11 hours' then
    return format('%s: só %s de descanso até o início do dia seguinte (%s); o RH exige 11 h.',
                  to_char(p_data, 'DD/MM'), private.fmt_h(v_ini_prox - v_fim), to_char(v_ini_prox, 'HH24:MI'));
  end if;
  return null;
end;
$$;

-- Todas as regras para um item candidato (sem gravar). Devolve o primeiro motivo de bloqueio ou null.
create or replace function private.motivo_bloqueio(
  p_id uuid, p_tipo text, p_data date, p_ini time, p_fim time,
  p_instrutor uuid, p_turma uuid, p_uc uuid, p_trabalho boolean,
  p_jornada boolean default true)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_inst public.usuarios; v_turma public.turmas; v_uc public.ucs; v_choque record;
  v_periodo tsrange := tsrange(p_data + p_ini, p_data + p_fim, '[)');
  v_dia text := to_char(p_data, 'DD/MM');
begin
  if p_fim <= p_ini then return 'O horário final precisa ser depois do inicial.'; end if;

  select * into v_inst from public.usuarios where id = p_instrutor;
  if v_inst.id is null or not v_inst.ativo or not v_inst.leciona then
    return 'Instrutor inválido ou inativo.';
  end if;

  if p_tipo = 'aula' then
    select * into v_turma from public.turmas where id = p_turma;
    select * into v_uc from public.ucs where id = p_uc;
    if v_turma.id is null or not v_turma.ativo then return 'Turma inválida ou inativa.'; end if;
    if v_uc.id is null or v_uc.curso_id <> v_turma.curso_id then return 'A UC não pertence ao curso da turma.'; end if;
  end if;

  select coalesce(t.nome, i.titulo) as nome, i.hora_inicio, i.hora_fim into v_choque
  from public.itens i left join public.turmas t on t.id = i.turma_id
  where i.instrutor_id = p_instrutor and i.periodo && v_periodo and i.id is distinct from p_id
  limit 1;
  if found then
    return format('%s: %s já tem "%s" das %s às %s.', v_dia, v_inst.nome, v_choque.nome,
                  to_char(v_choque.hora_inicio, 'HH24:MI'), to_char(v_choque.hora_fim, 'HH24:MI'));
  end if;

  if p_tipo = 'aula' then
    select u.nome, i.hora_inicio, i.hora_fim into v_choque
    from public.itens i join public.usuarios u on u.id = i.instrutor_id
    where i.turma_id = p_turma and i.periodo && v_periodo and i.id is distinct from p_id
    limit 1;
    if found then
      return format('%s: a turma %s já tem aula com %s das %s às %s.', v_dia, v_turma.nome, v_choque.nome,
                    to_char(v_choque.hora_inicio, 'HH24:MI'), to_char(v_choque.hora_fim, 'HH24:MI'));
    end if;
  end if;

  if p_jornada then
    return private.motivo_jornada(p_instrutor, p_data, p_ini, p_fim, p_trabalho, p_id);
  end if;
  return null;
end;
$$;

create or replace function private.ignorar_regras()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('app.ignorar_regras', true), '') = 'on';
$$;

-- Antes de gravar: coerência, sobreposição (mensagem amigável; a exclusion constraint garante no fim).
create or replace function private.itens_validar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_motivo text;
begin
  if private.ignorar_regras() then return new; end if;
  if tg_op = 'UPDATE'
     and (new.tipo, new.data, new.hora_inicio, new.hora_fim, new.instrutor_id, new.turma_id, new.uc_id, new.trabalho)
         is not distinct from
         (old.tipo, old.data, old.hora_inicio, old.hora_fim, old.instrutor_id, old.turma_id, old.uc_id, old.trabalho) then
    return new;
  end if;
  v_motivo := private.motivo_bloqueio(new.id, new.tipo, new.data, new.hora_inicio, new.hora_fim,
                                      new.instrutor_id, new.turma_id, new.uc_id, new.trabalho, false);
  if v_motivo is not null then raise exception using errcode = 'P0001', message = v_motivo; end if;
  return new;
end;
$$;

-- No commit: jornada do RH (vê todos os itens gravados na transação, inclusive lançamentos em lote).
create or replace function private.itens_jornada()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_motivo text;
begin
  if private.ignorar_regras() then return null; end if;
  if tg_op = 'UPDATE'
     and (new.data, new.hora_inicio, new.hora_fim, new.instrutor_id, new.trabalho)
         is not distinct from (old.data, old.hora_inicio, old.hora_fim, old.instrutor_id, old.trabalho) then
    return null;
  end if;
  if not new.trabalho then return null; end if;
  -- o item pode ter sido apagado depois na mesma transação
  if not exists (select 1 from public.itens where id = new.id) then return null; end if;
  v_motivo := private.motivo_jornada(new.instrutor_id, new.data);
  if v_motivo is not null then raise exception using errcode = 'P0001', message = v_motivo; end if;
  return null;
end;
$$;

create or replace function private.itens_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create or replace function private.itens_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.ignorar_regras() then return coalesce(new, old); end if;
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'updated_at' - 'updated_by') = (to_jsonb(old) - 'updated_at' - 'updated_by') then
    return new;
  end if;
  insert into public.historico (item_id, operacao, antes, depois, feito_por)
  values (coalesce(new.id, old.id), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end;
$$;

create trigger itens_touch before insert or update on public.itens
  for each row execute function private.itens_touch();
create trigger itens_validar before insert or update on public.itens
  for each row execute function private.itens_validar();
create constraint trigger itens_jornada after insert or update on public.itens
  deferrable initially deferred
  for each row execute function private.itens_jornada();
create trigger itens_audit after insert or update or delete on public.itens
  for each row execute function private.itens_audit();

-- =============================================================
-- RPCs usadas pela tela
-- =============================================================

-- Mini calendário: para cada data, o motivo de bloqueio (null = livre).
create or replace function public.disponibilidade(
  p_datas date[], p_ini time, p_fim time, p_instrutor uuid,
  p_tipo text default 'aula', p_turma uuid default null, p_uc uuid default null,
  p_trabalho boolean default true, p_ignorar uuid default null)
returns table (data date, motivo text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.e_gestor() then raise exception 'Sem permissão.'; end if;
  return query
    select d, private.motivo_bloqueio(p_ignorar, p_tipo, d, p_ini, p_fim, p_instrutor, p_turma, p_uc, p_trabalho, true)
    from unnest(p_datas) as d;
end;
$$;

-- Instrutor marca material/PTD da própria aula (gestor também pode).
create or replace function public.marcar_item(p_id uuid, p_campo text, p_valor boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_item public.itens;
begin
  select * into v_item from public.itens where id = p_id;
  if v_item.id is null or v_item.tipo <> 'aula' then raise exception 'Aula não encontrada.'; end if;
  if v_item.instrutor_id <> auth.uid() and not private.e_gestor() then raise exception 'Sem permissão.'; end if;
  if p_campo = 'material' then
    update public.itens set material_ok = p_valor where id = p_id;
  elsif p_campo = 'ptd' then
    update public.itens set ptd_ok = p_valor where id = p_id;
  else
    raise exception 'Campo inválido.';
  end if;
end;
$$;

-- Grava curso + UCs (revisados na tela de importação do plano) numa transação.
create or replace function public.salvar_curso(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_uc jsonb;
begin
  if not private.e_gestor() then raise exception 'Sem permissão.'; end if;
  insert into public.cursos (nome, eixo, segmento, ch_total, codigo_dn, cbo, hora_aula_min)
  values (p->>'nome', p->>'eixo', p->>'segmento', (p->>'ch_total')::numeric, p->>'codigo_dn', p->>'cbo',
          coalesce((p->>'hora_aula_min')::int, 60))
  returning id into v_id;
  for v_uc in select * from jsonb_array_elements(coalesce(p->'ucs', '[]'::jsonb)) loop
    insert into public.ucs (curso_id, numero, nome, ch, tipo, indicadores, conhecimentos, habilidades, atitudes, integra)
    values (v_id, (v_uc->>'numero')::int, v_uc->>'nome', (v_uc->>'ch')::numeric,
            coalesce(v_uc->>'tipo', 'regular'),
            array(select jsonb_array_elements_text(coalesce(v_uc->'indicadores', '[]'))),
            array(select jsonb_array_elements_text(coalesce(v_uc->'conhecimentos', '[]'))),
            array(select jsonb_array_elements_text(coalesce(v_uc->'habilidades', '[]'))),
            array(select jsonb_array_elements_text(coalesce(v_uc->'atitudes', '[]'))),
            array(select (jsonb_array_elements_text(coalesce(v_uc->'integra', '[]')))::int));
  end loop;
  return v_id;
end;
$$;

revoke all on function public.disponibilidade(date[], time, time, uuid, text, uuid, uuid, boolean, uuid),
                       public.marcar_item(uuid, text, boolean), public.salvar_curso(jsonb) from public, anon;
grant execute on function public.disponibilidade(date[], time, time, uuid, text, uuid, uuid, boolean, uuid),
                          public.marcar_item(uuid, text, boolean), public.salvar_curso(jsonb) to authenticated;

-- Horas por turma × UC (relógio). "realizadas" = aulas até ontem + as de hoje já terminadas.
create view public.progresso with (security_invoker = on) as
select i.turma_id, i.uc_id,
       count(*)::int as aulas,
       round(sum(extract(epoch from i.hora_fim - i.hora_inicio)) / 3600, 2) as horas_agendadas,
       round(coalesce(sum(extract(epoch from i.hora_fim - i.hora_inicio))
               filter (where i.data + i.hora_fim <= (now() at time zone 'America/Sao_Paulo')), 0) / 3600, 2) as horas_realizadas
from public.itens i
where i.tipo = 'aula'
group by i.turma_id, i.uc_id;

-- =============================================================
-- Segurança (RLS)
-- =============================================================
alter table public.usuarios  enable row level security;
alter table public.cursos    enable row level security;
alter table public.ucs       enable row level security;
alter table public.turmas    enable row level security;
alter table public.itens     enable row level security;
alter table public.historico enable row level security;

revoke all on public.usuarios, public.cursos, public.ucs, public.turmas, public.itens, public.historico, public.progresso from anon;

create policy usuarios_select on public.usuarios for select to authenticated using ((select private.e_usuario()));
create policy usuarios_insert on public.usuarios for insert to authenticated
  with check ((select private.e_gestor()) and (papel <> 'admin' or (select private.papel()) = 'admin'));
create policy usuarios_update on public.usuarios for update to authenticated
  using ((select private.e_gestor()))
  with check ((select private.e_gestor()) and (papel <> 'admin' or (select private.papel()) = 'admin'));

create policy cursos_select on public.cursos for select to authenticated using ((select private.e_usuario()));
create policy cursos_insert on public.cursos for insert to authenticated with check ((select private.e_gestor()));
create policy cursos_update on public.cursos for update to authenticated
  using ((select private.e_gestor())) with check ((select private.e_gestor()));

create policy ucs_select on public.ucs for select to authenticated using ((select private.e_usuario()));
create policy ucs_insert on public.ucs for insert to authenticated with check ((select private.e_gestor()));
create policy ucs_update on public.ucs for update to authenticated
  using ((select private.e_gestor())) with check ((select private.e_gestor()));
create policy ucs_delete on public.ucs for delete to authenticated using ((select private.e_gestor()));

create policy turmas_select on public.turmas for select to authenticated using ((select private.e_usuario()));
create policy turmas_insert on public.turmas for insert to authenticated with check ((select private.e_gestor()));
create policy turmas_update on public.turmas for update to authenticated
  using ((select private.e_gestor())) with check ((select private.e_gestor()));

create policy itens_select on public.itens for select to authenticated using (
  (select private.e_gestor())
  or instrutor_id = (select auth.uid())
  or (tipo = 'aula' and turma_id in (select private.minhas_turmas()))
);
create policy itens_insert on public.itens for insert to authenticated with check ((select private.e_gestor()));
create policy itens_update on public.itens for update to authenticated
  using ((select private.e_gestor())) with check ((select private.e_gestor()));
create policy itens_delete on public.itens for delete to authenticated using ((select private.e_gestor()));

create policy historico_select on public.historico for select to authenticated using ((select private.e_gestor()));
