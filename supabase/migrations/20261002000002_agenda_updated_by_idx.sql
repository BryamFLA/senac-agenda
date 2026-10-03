-- índice para a FK updated_by (advisor do Supabase)
create index if not exists agenda_updated_by_idx on public.agenda (updated_by);
