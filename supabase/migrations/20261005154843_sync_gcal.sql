-- Espelho da agenda no Google Calendar: cada mudança em public.agenda chama a Edge Function sync-gcal,
-- e uma conferência diária às 03:00 (Brasília) corrige o que o disparo não pegou.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- O segredo do header fica no Vault (sync_gcal_secret), nunca no repositório.
create or replace function private.chamar_sync_gcal(corpo jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  segredo text;
begin
  select decrypted_secret into segredo from vault.decrypted_secrets where name = 'sync_gcal_secret';
  if segredo is null then
    raise warning 'sync_gcal_secret ausente no Vault: sincronização não enviada';
    return;
  end if;
  perform net.http_post(
    url := 'https://lgdbckmppeaddnhecwix.supabase.co/functions/v1/sync-gcal',
    body := corpo,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', segredo),
    timeout_milliseconds := 5000
  );
end;
$$;
revoke all on function private.chamar_sync_gcal(jsonb) from public;

create or replace function private.agenda_sync_gcal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- a gravação do gcal_event_id feita pela própria sincronização não dispara de novo
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'gcal_event_id' - 'updated_at' - 'updated_by')
       = (to_jsonb(old) - 'gcal_event_id' - 'updated_at' - 'updated_by') then
    return null;
  end if;
  perform private.chamar_sync_gcal(jsonb_build_object('id', coalesce(new.id, old.id)));
  return null;
end;
$$;

create trigger agenda_sync_gcal
  after insert or update or delete on public.agenda
  for each row execute function private.agenda_sync_gcal();

-- 06:00 UTC = 03:00 em Brasília (sem horário de verão)
select cron.schedule(
  'sync-gcal-conferir',
  '0 6 * * *',
  $$select private.chamar_sync_gcal('{"conferir": true}'::jsonb)$$
);
