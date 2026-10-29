-- Executado à mão pelo Bryam no SQL Editor do Supabase (o MCP recusa delete em massa).
-- Remove os dados de teste atuais:
--   1. tudo da chamada (presenças, alunos nas turmas e cadastro de alunos) — a chamada não entra nesta versão,
--      então nada disso é dado real;
--   2. o que sobrar dos testes da v1 (usuários @senac-agenda.test, curso/turma "TESTE"), caso o
--      2026-10-15_limpar_dados_de_teste.sql não tenha sido rodado.
-- Não toca nos eventos da v0, nos usuários reais nem nos cursos/turmas/aulas cadastrados de verdade.
-- As tabelas da chamada continuam existindo (vazias).
begin;

-- 1. chamada
delete from public.presencas;                                    -- o trigger de auditoria grava linhas DELETE no histórico…
delete from public.historico where coalesce(depois, antes) ? 'aluno_id';  -- …que saem aqui, junto com as da chamada
delete from public.matriculas;
delete from public.alunos;

-- 2. restos dos testes da v1
delete from public.itens
 where turma_id in (select id from public.turmas where nome = 'TESTE Turma v1')
    or instrutor_id in (select id from public.usuarios where email like '%@senac-agenda.test');
delete from public.historico where item_id not in (select id from public.itens);
delete from public.turmas where nome = 'TESTE Turma v1';
delete from public.cursos where nome = 'TESTE Curso v1';
delete from public.usuarios where email like '%@senac-agenda.test';
delete from auth.users where email like '%@senac-agenda.test';

commit;

-- conferência: tudo deve dar 0
select (select count(*) from public.alunos)     as alunos,
       (select count(*) from public.matriculas) as matriculas,
       (select count(*) from public.presencas)  as presencas,
       (select count(*) from public.historico where coalesce(depois, antes) ? 'aluno_id') as historico_chamada,
       (select count(*) from public.usuarios where email like '%@senac-agenda.test') as usuarios_teste,
       (select count(*) from public.cursos where nome = 'TESTE Curso v1') as cursos_teste,
       (select count(*) from public.turmas where nome = 'TESTE Turma v1') as turmas_teste;
