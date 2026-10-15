-- =============================================================
-- Choque de horário (instrutor ou turma) passa de bloqueio a AVISO (funções).
-- A remoção das travas antigas está em supabase/manual/2026-10-15_remover_travas_de_choque.sql.
-- Continua bloqueando: coerência da aula e regras do RH (10 h/dia, 11 h de interjornada).
-- A jornada passa a contar a UNIÃO dos horários (duas aulas sobrepostas contam o tempo uma vez só).
-- =============================================================

create index if not exists itens_instrutor_periodo_idx on public.itens using gist (instrutor_id, periodo);
create index if not exists itens_turma_periodo_idx on public.itens using gist (turma_id, periodo) where turma_id is not null;

-- Jornada do RH num dia, com a união dos períodos de trabalho.
create or replace function private.motivo_jornada(
  p_instrutor uuid, p_data date,
  p_ini time default null, p_fim time default null, p_trabalho boolean default true,
  p_ignorar uuid default null)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_dia tsmultirange; v_total interval; v_ini timestamp; v_fim timestamp; v_fim_ant timestamp; v_ini_prox timestamp;
begin
  with base as (
    select i.data, tsrange(i.data + i.hora_inicio, i.data + i.hora_fim, '[)') as r from public.itens i
    where i.instrutor_id = p_instrutor and i.trabalho
      and i.data between p_data - 1 and p_data + 1
      and i.id is distinct from p_ignorar
    union all
    select p_data, tsrange(p_data + p_ini, p_data + p_fim, '[)') where p_ini is not null and p_trabalho
  )
  select range_agg(r) filter (where data = p_data),
         max(upper(r)) filter (where data = p_data - 1),
         min(lower(r)) filter (where data = p_data + 1)
    into v_dia, v_fim_ant, v_ini_prox
  from base;

  if v_dia is null or isempty(v_dia) then return null; end if;
  select sum(upper(x) - lower(x)), min(lower(x)), max(upper(x)) into v_total, v_ini, v_fim from unnest(v_dia) x;

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

-- Bloqueios (impedem gravar): instrutor/turma/UC inválidos e regras do RH. Choque de horário NÃO entra aqui.
create or replace function private.motivo_bloqueio(
  p_id uuid, p_tipo text, p_data date, p_ini time, p_fim time,
  p_instrutor uuid, p_turma uuid, p_uc uuid, p_trabalho boolean,
  p_jornada boolean default true)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_inst public.usuarios; v_turma public.turmas; v_uc public.ucs;
begin
  if p_fim <= p_ini then return 'O horário final precisa ser depois do inicial.'; end if;
  select * into v_inst from public.usuarios where id = p_instrutor;
  if v_inst.id is null or not v_inst.ativo or not v_inst.leciona then return 'Instrutor inválido ou inativo.'; end if;
  if p_tipo = 'aula' then
    select * into v_turma from public.turmas where id = p_turma;
    select * into v_uc from public.ucs where id = p_uc;
    if v_turma.id is null or not v_turma.ativo then return 'Turma inválida ou inativa.'; end if;
    if v_uc.id is null or v_uc.curso_id <> v_turma.curso_id then return 'A UC não pertence ao curso da turma.'; end if;
  end if;
  if p_jornada then
    return private.motivo_jornada(p_instrutor, p_data, p_ini, p_fim, p_trabalho, p_id);
  end if;
  return null;
end;
$$;

-- Avisos de choque de horário (não impedem gravar). Null = sem conflito.
create or replace function private.motivo_conflito(
  p_id uuid, p_data date, p_ini time, p_fim time, p_instrutor uuid, p_turma uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_periodo tsrange := tsrange(p_data + p_ini, p_data + p_fim, '[)'); v_c record; v_msg text[] := '{}';
begin
  if p_instrutor is not null then
    select u.nome as inst, coalesce(t.nome, i.titulo) as nome, i.hora_inicio, i.hora_fim into v_c
    from public.itens i join public.usuarios u on u.id = i.instrutor_id left join public.turmas t on t.id = i.turma_id
    where i.instrutor_id = p_instrutor and i.periodo && v_periodo and i.id is distinct from p_id
    order by i.hora_inicio limit 1;
    if found then
      v_msg := v_msg || format('%s já tem "%s" das %s às %s.', v_c.inst, v_c.nome,
                               to_char(v_c.hora_inicio, 'HH24:MI'), to_char(v_c.hora_fim, 'HH24:MI'));
    end if;
  end if;
  if p_turma is not null then
    select t.nome as turma, u.nome as inst, i.hora_inicio, i.hora_fim into v_c
    from public.itens i join public.turmas t on t.id = i.turma_id join public.usuarios u on u.id = i.instrutor_id
    where i.turma_id = p_turma and i.periodo && v_periodo and i.id is distinct from p_id
      and i.instrutor_id is distinct from p_instrutor
    order by i.hora_inicio limit 1;
    if found then
      v_msg := v_msg || format('A turma %s já tem aula com %s das %s às %s.', v_c.turma, v_c.inst,
                               to_char(v_c.hora_inicio, 'HH24:MI'), to_char(v_c.hora_fim, 'HH24:MI'));
    end if;
  end if;
  return case when cardinality(v_msg) = 0 then null else to_char(p_data, 'DD/MM') || ': ' || array_to_string(v_msg, ' ') end;
end;
$$;

-- Mini calendário: por data, bloqueio (motivo) e aviso de choque (conflito).
create or replace function public.disponibilidade_datas(
  p_datas date[], p_ini time, p_fim time, p_instrutor uuid,
  p_tipo text default 'aula', p_turma uuid default null, p_uc uuid default null,
  p_trabalho boolean default true, p_ignorar uuid default null)
returns table (data date, motivo text, conflito text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.e_gestor() then raise exception 'Sem permissão.'; end if;
  return query
    select d,
           private.motivo_bloqueio(p_ignorar, p_tipo, d, p_ini, p_fim, p_instrutor, p_turma, p_uc, p_trabalho, true),
           private.motivo_conflito(p_ignorar, d, p_ini, p_fim, p_instrutor, case when p_tipo = 'aula' then p_turma end)
    from unnest(p_datas) as d;
end;
$$;

-- Listas do formulário: por instrutor e por turma, bloqueio e conflito num dia/horário.
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
    from public.turmas t where t.ativo;
end;
$$;

-- Conflitos que já existem num período (cartões em vermelho e lista do painel).
-- Só devolve itens que quem chama pode ver (gestor: todos; instrutor: os seus e as aulas das suas turmas).
create or replace function public.conflitos_periodo(p_ini date, p_fim date)
returns table (item_id uuid, motivo text)
language sql stable security definer set search_path = '' as $$
  select i.id,
         string_agg(distinct case
           when o.instrutor_id = i.instrutor_id then
             format('Choca com "%s" (%s, %s–%s).', coalesce(ot.nome, o.titulo), ou.nome,
                    to_char(o.hora_inicio, 'HH24:MI'), to_char(o.hora_fim, 'HH24:MI'))
           else
             format('A turma também tem aula com %s (%s–%s).', ou.nome,
                    to_char(o.hora_inicio, 'HH24:MI'), to_char(o.hora_fim, 'HH24:MI'))
         end, ' ')
  from public.itens i
  join public.itens o on o.id <> i.id and o.periodo && i.periodo
       and (o.instrutor_id = i.instrutor_id or (i.turma_id is not null and o.turma_id = i.turma_id))
  join public.usuarios ou on ou.id = o.instrutor_id
  left join public.turmas ot on ot.id = o.turma_id
  where i.data between p_ini and p_fim
    and (private.e_gestor() or i.instrutor_id = auth.uid()
         or (i.tipo = 'aula' and i.turma_id in (select private.minhas_turmas())))
  group by i.id;
$$;

revoke all on function public.disponibilidade_datas(date[], time, time, uuid, text, uuid, uuid, boolean, uuid),
                       public.ocupacao_no_horario(date, time, time, uuid),
                       public.conflitos_periodo(date, date) from public, anon;
grant execute on function public.disponibilidade_datas(date[], time, time, uuid, text, uuid, uuid, boolean, uuid),
                          public.ocupacao_no_horario(date, time, time, uuid),
                          public.conflitos_periodo(date, date) to authenticated;
