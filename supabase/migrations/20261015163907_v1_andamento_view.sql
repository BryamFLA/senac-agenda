-- Andamento por turma × UC × instrutor (painel): horas, datas, aulas futuras e pendências de material/PTD.
-- security_invoker: cada um vê só o que o RLS de itens permite.
create or replace view public.andamento with (security_invoker = on) as
select i.turma_id, i.uc_id, i.instrutor_id,
       count(*)::int as aulas,
       round(sum(extract(epoch from i.hora_fim - i.hora_inicio)) / 3600, 2) as horas_agendadas,
       round(coalesce(sum(extract(epoch from i.hora_fim - i.hora_inicio))
               filter (where i.data + i.hora_fim <= (now() at time zone 'America/Sao_Paulo')), 0) / 3600, 2) as horas_realizadas,
       min(i.data) as primeira_aula,
       max(i.data) as ultima_aula,
       min(i.data) filter (where i.data >= (now() at time zone 'America/Sao_Paulo')::date) as proxima_aula,
       count(*) filter (where i.data >= (now() at time zone 'America/Sao_Paulo')::date)::int as aulas_futuras,
       count(*) filter (where i.data >= (now() at time zone 'America/Sao_Paulo')::date and not i.material_ok)::int as material_pendente,
       count(*) filter (where i.data >= (now() at time zone 'America/Sao_Paulo')::date and not i.ptd_ok)::int as ptd_pendente
from public.itens i
where i.tipo = 'aula'
group by i.turma_id, i.uc_id, i.instrutor_id;

revoke all on public.andamento from anon;
grant select on public.andamento to authenticated;
