-- Aplicada à mão no SQL Editor em 15/10/2026 (o MCP recusa drop): não consta em supabase_migrations do remoto.
-- Complementa a migração 20261015135258_v1_conflitos_funcoes: choque de horário deixa de bloquear
-- (vira aviso na tela) e as funções antigas, substituídas por disponibilidade_datas e
-- ocupacao_no_horario, são removidas.
alter table public.itens drop constraint if exists itens_sem_choque_instrutor;
alter table public.itens drop constraint if exists itens_sem_choque_turma;
drop function if exists public.disponibilidade(date[], time, time, uuid, text, uuid, uuid, boolean, uuid);
drop function if exists public.livres_no_horario(date, time, time, uuid);
