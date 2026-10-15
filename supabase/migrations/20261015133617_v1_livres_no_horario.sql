-- Quem está livre num dia/horário: usado nas listas de instrutor e turma do formulário de lançamento.
-- Instrutor: choque de horário + regras do RH (como um evento de trabalho). Turma: choque de horário.
create or replace function public.livres_no_horario(p_data date, p_ini time, p_fim time, p_ignorar uuid default null)
returns table (tipo text, id uuid, motivo text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.e_gestor() then raise exception 'Sem permissão.'; end if;
  return query
    select 'instrutor'::text, u.id,
           private.motivo_bloqueio(p_ignorar, 'evento', p_data, p_ini, p_fim, u.id, null, null, true, true)
    from public.usuarios u
    where u.ativo and u.leciona
    union all
    select 'turma'::text, t.id,
           (select format('%s: a turma %s já tem aula com %s das %s às %s.', to_char(p_data, 'DD/MM'), t.nome, us.nome,
                          to_char(i.hora_inicio, 'HH24:MI'), to_char(i.hora_fim, 'HH24:MI'))
            from public.itens i join public.usuarios us on us.id = i.instrutor_id
            where i.turma_id = t.id and i.periodo && tsrange(p_data + p_ini, p_data + p_fim, '[)')
              and i.id is distinct from p_ignorar
            limit 1)
    from public.turmas t
    where t.ativo;
end;
$$;

revoke all on function public.livres_no_horario(date, time, time, uuid) from public, anon;
grant execute on function public.livres_no_horario(date, time, time, uuid) to authenticated;
