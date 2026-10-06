-- Pausa o espelho no Google Calendar durante a reestruturação (cursos/turmas/UCs).
-- Nada é apagado: a função sync-gcal, os segredos e os eventos já criados continuam.
-- Para reativar:
--   alter table public.agenda enable trigger agenda_sync_gcal;
--   select cron.alter_job((select jobid from cron.job where jobname = 'sync-gcal-conferir'), active := true);
alter table public.agenda disable trigger agenda_sync_gcal;
select cron.alter_job((select jobid from cron.job where jobname = 'sync-gcal-conferir'), active := false);
