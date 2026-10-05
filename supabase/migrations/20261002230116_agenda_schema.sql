-- =============================================================
-- Agenda SENAC — esquema inicial
-- Fonte única da agenda do instrutor. Editado pelas coordenadoras
-- via agenda.bryam.com.br e espelhado no Google Calendar.
-- =============================================================

create schema if not exists private;

-- ---------- tipos ----------
create type public.turno as enum ('M', 'T', 'N');
create type public.tipo_compromisso as enum
  ('aula', 'planejamento', 'evento', 'feriado', 'ferias', 'folga', 'outro');

-- ---------- quem pode editar ----------
create table public.editores (
  email      text primary key check (email = lower(email)),
  nome       text not null,
  papel      text not null default 'coordenacao' check (papel in ('admin', 'coordenacao')),
  created_at timestamptz not null default now()
);
comment on table public.editores is 'Allowlist de quem pode ler/editar a agenda. Login sem e-mail aqui não acessa nada.';

-- ---------- catálogo de compromissos (lista suspensa da tela) ----------
create table public.compromissos (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null unique,
  subtitulo          text,          -- 2ª linha da célula: código da turma, PSG, INTEC...
  codigo_turma       text check (codigo_turma ~ '^\d{9}$'),
  tipo               public.tipo_compromisso not null default 'aula',
  hora_inicio_padrao time,
  hora_fim_padrao    time,
  cor                text,
  ativo              boolean not null default true,
  created_at         timestamptz not null default now()
);

-- ---------- agenda ----------
create table public.agenda (
  id             uuid primary key default gen_random_uuid(),
  data           date not null,
  turno          public.turno not null,
  compromisso_id uuid not null references public.compromissos (id),
  hora_inicio    time,
  hora_fim       time,
  observacao     text,
  gcal_event_id  text,               -- técnico: id do evento espelhado no Google
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id) on delete set null,
  constraint agenda_um_por_turno unique (data, turno),
  constraint agenda_horario_valido check (
    (hora_inicio is null and hora_fim is null)
    or (hora_inicio is not null and (hora_fim is null or hora_fim > hora_inicio))
  )
);
create index agenda_data_idx on public.agenda (data);
create index agenda_compromisso_idx on public.agenda (compromisso_id);

-- ---------- histórico (quem alterou o quê) ----------
create table public.agenda_historico (
  id          bigint generated always as identity primary key,
  agenda_id   uuid not null,
  operacao    text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  antes       jsonb,
  depois      jsonb,
  feito_por   uuid,
  feito_em    timestamptz not null default now()
);
create index agenda_historico_agenda_idx on public.agenda_historico (agenda_id, feito_em desc);

-- ---------- funções ----------
create or replace function private.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.editores e
    where e.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function private.is_editor() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_editor() to authenticated;

create or replace function private.agenda_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create or replace function private.agenda_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- não registra no histórico a gravação do gcal_event_id feita pela sincronização
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'gcal_event_id' - 'updated_at' - 'updated_by')
       = (to_jsonb(old) - 'gcal_event_id' - 'updated_at' - 'updated_by') then
    return new;
  end if;
  insert into public.agenda_historico (agenda_id, operacao, antes, depois, feito_por)
  values (
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

create trigger agenda_touch
  before insert or update on public.agenda
  for each row execute function private.agenda_touch();

create trigger agenda_audit
  after insert or update or delete on public.agenda
  for each row execute function private.agenda_audit();

-- ---------- segurança (RLS) ----------
alter table public.editores        enable row level security;
alter table public.compromissos    enable row level security;
alter table public.agenda          enable row level security;
alter table public.agenda_historico enable row level security;

revoke all on public.editores, public.compromissos, public.agenda, public.agenda_historico from anon;

create policy editores_select on public.editores
  for select to authenticated using ((select private.is_editor()));

create policy compromissos_select on public.compromissos
  for select to authenticated using ((select private.is_editor()));
create policy compromissos_insert on public.compromissos
  for insert to authenticated with check ((select private.is_editor()));
create policy compromissos_update on public.compromissos
  for update to authenticated using ((select private.is_editor())) with check ((select private.is_editor()));

create policy agenda_select on public.agenda
  for select to authenticated using ((select private.is_editor()));
create policy agenda_insert on public.agenda
  for insert to authenticated with check ((select private.is_editor()));
create policy agenda_update on public.agenda
  for update to authenticated using ((select private.is_editor())) with check ((select private.is_editor()));
create policy agenda_delete on public.agenda
  for delete to authenticated using ((select private.is_editor()));

create policy historico_select on public.agenda_historico
  for select to authenticated using ((select private.is_editor()));
