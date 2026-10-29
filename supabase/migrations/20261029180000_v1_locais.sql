-- Aplicada à mão no SQL Editor em 29/10/2026 (MCP desconectado): não consta em supabase_migrations do remoto.
-- Local da aula: cadastro de locais, local em cada item da agenda, agenda por local e conflito de local.
--   TEPT: choque de local é AVISO (como instrutor/turma).
--   Instrutor: só reserva local para os próprios itens, e só se ninguém mais estiver no local nesse horário (BLOQUEIA).
-- Recria disponibilidade_datas (novo parâmetro p_local) e ocorrencias_periodo (nova coluna local_id).
begin;

-- ---------- locais ----------
create table public.locais (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (length(trim(nome)) > 0),
  ordem      integer not null default 100,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  constraint locais_nome_unico unique (nome)
);

insert into public.locais (nome, ordem) values
  ('Sala 1', 1), ('Sala 2', 2), ('Sala 3', 3), ('Sala 4', 4), ('Sala 5', 5), ('Sala 6', 6),
  ('Laboratório de Informática', 10), ('Laboratório de Enfermagem', 11), ('Laboratório de Estética', 12),
  ('Laboratório de Cabeleireiro', 13), ('Cozinha Pedagógica', 14), ('Auditório', 20), ('Biblioteca', 21);

alter table public.locais enable row level security;
revoke all on public.locais from anon;
create policy locais_select on public.locais for select to authenticated using ((select private.e_usuario()));
create policy locais_insert on public.locais for insert to authenticated with check ((select private.e_gestor()));
create policy locais_update on public.locais for update to authenticated
  using ((select private.e_gestor())) with check ((select private.e_gestor()));

-- ---------- local em cada item: um local cadastrado OU um texto livre ("outro local") ----------
alter table public.itens
  add column local_id uuid references public.locais (id),
  add column local_outro text,
  add constraint itens_um_local check (local_id is null or local_outro is null);
create index itens_local_periodo_idx on public.itens using gist (local_id, periodo) where local_id is not null;

-- Aviso de choque de local (sem a data na frente). Null = local livre.
create or replace function private.conflito_local(p_id uuid, p_data date, p_ini time, p_fim time, p_local uuid)
returns text language sql stable security definer set search_path = '' as $$
  select format('Local "%s" já reservado para "%s" (%s, %s–%s).', l.nome, coalesce(t.nome, i.titulo), u.nome,
                to_char(i.hora_inicio, 'HH24:MI'), to_char(i.hora_fim, 'HH24:MI'))
  from public.itens i
  join public.locais l on l.id = i.local_id
  join public.usuarios u on u.id = i.instrutor_id
  left join public.turmas t on t.id = i.turma_id
  where p_local is not null and i.local_id = p_local and i.id is distinct from p_id
    and i.periodo && tsrange(p_data + p_ini, p_data + p_fim, '[)')
  order by i.hora_inicio
  limit 1;
$$;

-- Mini calendário: agora também avisa choque de local.
drop function public.disponibilidade_datas(date[], time, time, uuid, text, uuid, uuid, boolean, uuid);
create function public.disponibilidade_datas(
  p_datas date[], p_ini time, p_fim time, p_instrutor uuid,
  p_tipo text default 'aula', p_turma uuid default null, p_uc uuid default null,
  p_trabalho boolean default true, p_ignorar uuid default null, p_local uuid default null)
returns table (data date, motivo text, conflito text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.e_gestor() then raise exception 'Sem permissão.'; end if;
  return query
    select x.d, x.motivo,
           case when x.c is null and x.l is null then null
                when x.c is null then to_char(x.d, 'DD/MM') || ': ' || x.l
                when x.l is null then x.c
                else x.c || ' ' || x.l end
    from (
      select d,
             private.motivo_bloqueio(p_ignorar, p_tipo, d, p_ini, p_fim, p_instrutor, p_turma, p_uc, p_trabalho, true) as motivo,
             private.motivo_conflito(p_ignorar, d, p_ini, p_fim, p_instrutor, case when p_tipo = 'aula' then p_turma end) as c,
             private.conflito_local(p_ignorar, d, p_ini, p_fim, p_local) as l
      from unnest(p_datas) as d
    ) x;
end;
$$;

-- Listas do formulário: instrutores, turmas e agora locais.
create or replace function public.ocupacao_no_horario(p_data date, p_ini time, p_fim time, p_ignorar uuid default null)
returns table (tipo text, id uuid, motivo text, conflito text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.e_gestor() then raise exception 'Sem permissão.'; end if;
  return query
    select 'instrutor'::text, u.id,
           private.motivo_bloqueio(p_ignorar, 'evento', p_data, p_ini, p_fim, u.id, null, null, true, true),
           private.motivo_conflito(p_ignorar, p_data, p_ini, p_fim, u.id, null)
    from public.usuarios u where u.ativo and u.leciona
    union all
    select 'turma'::text, t.id, null::text,
           private.motivo_conflito(p_ignorar, p_data, p_ini, p_fim, null, t.id)
    from public.turmas t where t.ativo
    union all
    select 'local'::text, l.id, null::text,
           private.conflito_local(p_ignorar, p_data, p_ini, p_fim, l.id)
    from public.locais l where l.ativo;
end;
$$;

-- Conflitos já gravados: instrutor, turma ou local.
create or replace function public.conflitos_periodo(p_ini date, p_fim date)
returns table (item_id uuid, motivo text)
language sql stable security definer set search_path = '' as $$
  select i.id,
         string_agg(distinct case
           when o.instrutor_id = i.instrutor_id then
             format('Choca com "%s" (%s, %s–%s).', coalesce(ot.nome, o.titulo), ou.nome,
                    to_char(o.hora_inicio, 'HH24:MI'), to_char(o.hora_fim, 'HH24:MI'))
           when i.turma_id is not null and o.turma_id = i.turma_id then
             format('A turma também tem aula com %s (%s–%s).', ou.nome,
                    to_char(o.hora_inicio, 'HH24:MI'), to_char(o.hora_fim, 'HH24:MI'))
           else
             format('Local "%s" também reservado para "%s" (%s, %s–%s).', ol.nome, coalesce(ot.nome, o.titulo), ou.nome,
                    to_char(o.hora_inicio, 'HH24:MI'), to_char(o.hora_fim, 'HH24:MI'))
         end, ' ')
  from public.itens i
  join public.itens o on o.id <> i.id and o.periodo && i.periodo
       and (o.instrutor_id = i.instrutor_id or (i.turma_id is not null and o.turma_id = i.turma_id)
            or (i.local_id is not null and o.local_id = i.local_id))
  join public.usuarios ou on ou.id = o.instrutor_id
  left join public.turmas ot on ot.id = o.turma_id
  left join public.locais ol on ol.id = o.local_id
  where i.data between p_ini and p_fim
    and (private.e_gestor() or i.instrutor_id = auth.uid()
         or (i.tipo = 'aula' and i.turma_id in (select private.minhas_turmas())))
  group by i.id;
$$;

drop function public.ocorrencias_periodo(date, date);
create function public.ocorrencias_periodo(p_ini date, p_fim date)
returns table (item_id uuid, instrutor_id uuid, turma_id uuid, local_id uuid, motivo text)
language sql stable security definer set search_path = '' as $$
  select i.id, i.instrutor_id, i.turma_id, i.local_id,
         string_agg(distinct case
           when o.instrutor_id = i.instrutor_id then
             format('Choca com "%s" (%s, %s–%s).', coalesce(ot.nome, o.titulo), ou.nome,
                    to_char(o.hora_inicio, 'HH24:MI'), to_char(o.hora_fim, 'HH24:MI'))
           when i.turma_id is not null and o.turma_id = i.turma_id then
             format('A turma também tem aula com %s (%s–%s).', ou.nome,
                    to_char(o.hora_inicio, 'HH24:MI'), to_char(o.hora_fim, 'HH24:MI'))
           else
             format('Local "%s" também reservado para "%s" (%s, %s–%s).', ol.nome, coalesce(ot.nome, o.titulo), ou.nome,
                    to_char(o.hora_inicio, 'HH24:MI'), to_char(o.hora_fim, 'HH24:MI'))
         end, ' ')
  from public.itens i
  join public.itens o on o.id <> i.id and o.periodo && i.periodo
       and (o.instrutor_id = i.instrutor_id or (i.turma_id is not null and o.turma_id = i.turma_id)
            or (i.local_id is not null and o.local_id = i.local_id))
  join public.usuarios ou on ou.id = o.instrutor_id
  left join public.turmas ot on ot.id = o.turma_id
  left join public.locais ol on ol.id = o.local_id
  where i.data between p_ini and p_fim
    and (private.e_gestor() or i.instrutor_id = auth.uid()
         or (i.tipo = 'aula' and i.turma_id in (select private.minhas_turmas())))
  group by i.id, i.instrutor_id, i.turma_id, i.local_id;
$$;

-- Agenda de um local: todos os itens reservados nele (qualquer usuário vê, para saber se o local está livre).
create or replace function public.agenda_local(p_local uuid, p_ini date, p_fim date)
returns setof public.itens
language sql stable security definer set search_path = '' as $$
  select i.* from public.itens i
  where private.e_usuario() and i.local_id = p_local and i.data between p_ini and p_fim
  order by i.data, i.hora_inicio;
$$;

-- Define o local de um item. Gestor: livre (o choque vira aviso na tela).
-- Instrutor: só nos próprios itens e só se o local estiver vazio nesse horário (itens dele mesmo não contam).
create or replace function public.definir_local(p_item uuid, p_local uuid, p_outro text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_item public.itens; v_c record; v_outro text := nullif(trim(coalesce(p_outro, '')), '');
begin
  select * into v_item from public.itens where id = p_item;
  if v_item.id is null then raise exception 'Item não encontrado.'; end if;
  if p_local is not null and v_outro is not null then raise exception 'Escolha um local cadastrado ou digite outro, não os dois.'; end if;
  if p_local is not null and not exists (select 1 from public.locais where id = p_local and ativo) then
    raise exception 'Local inválido ou inativo.';
  end if;
  if not private.e_gestor() then
    if v_item.instrutor_id is distinct from auth.uid() then
      raise exception 'Você só pode reservar local para as suas aulas.';
    end if;
    if p_local is not null then
      select l.nome as local, coalesce(t.nome, i.titulo) as nome, u.nome as inst, i.hora_inicio, i.hora_fim into v_c
      from public.itens i
      join public.locais l on l.id = i.local_id
      join public.usuarios u on u.id = i.instrutor_id
      left join public.turmas t on t.id = i.turma_id
      where i.local_id = p_local and i.id <> p_item and i.periodo && v_item.periodo
        and i.instrutor_id <> v_item.instrutor_id
      order by i.hora_inicio limit 1;
      if found then
        raise exception 'Local "%" já reservado para "%" (%, %–%). Fale com a coordenação.', v_c.local, v_c.nome, v_c.inst,
          to_char(v_c.hora_inicio, 'HH24:MI'), to_char(v_c.hora_fim, 'HH24:MI');
      end if;
    end if;
  end if;
  update public.itens set local_id = p_local, local_outro = v_outro where id = p_item;
end;
$$;

revoke all on function private.conflito_local(uuid, date, time, time, uuid) from public;
grant execute on function private.conflito_local(uuid, date, time, time, uuid) to authenticated;
revoke all on function public.disponibilidade_datas(date[], time, time, uuid, text, uuid, uuid, boolean, uuid, uuid),
                       public.ocorrencias_periodo(date, date),
                       public.agenda_local(uuid, date, date),
                       public.definir_local(uuid, uuid, text) from public, anon;
grant execute on function public.disponibilidade_datas(date[], time, time, uuid, text, uuid, uuid, boolean, uuid, uuid),
                          public.ocorrencias_periodo(date, date),
                          public.agenda_local(uuid, date, date),
                          public.definir_local(uuid, uuid, text) to authenticated;

commit;
