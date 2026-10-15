-- Conflitos de horário já gravados num período, com instrutor e turma de cada item:
-- pinta os cartões e os nomes do filtro da agenda. Mesma visibilidade de conflitos_periodo.
create or replace function public.ocorrencias_periodo(p_ini date, p_fim date)
returns table (item_id uuid, instrutor_id uuid, turma_id uuid, motivo text)
language sql stable security definer set search_path = '' as $$
  select i.id, i.instrutor_id, i.turma_id,
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
  group by i.id, i.instrutor_id, i.turma_id;
$$;

revoke all on function public.ocorrencias_periodo(date, date) from public, anon;
grant execute on function public.ocorrencias_periodo(date, date) to authenticated;
