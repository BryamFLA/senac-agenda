-- Executado à mão pelo Bryam no SQL Editor do Supabase (o MCP recusa comandos de drop).
-- Complementa a migração 20261015135258_v1_conflitos_funcoes: choque de horário deixa de bloquear
-- (vira aviso na tela) e as funções antigas, substituídas por disponibilidade_datas e
-- ocupacao_no_horario, são removidas.
alter table public.itens drop constraint if exists itens_sem_choque_instrutor;
alter table public.itens drop constraint if exists itens_sem_choque_turma;
drop function if exists public.disponibilidade(date[], time, time, uuid, text, uuid, uuid, boolean, uuid);
drop function if exists public.livres_no_horario(date, time, time, uuid);
