-- Executado à mão pelo Bryam no SQL Editor do Supabase (o MCP recusa delete em massa).
-- Remove os dados criados nos testes da v1: 2 usuários de teste, curso/turma "TESTE" e as aulas deles.
-- Não toca nos 535 eventos importados da v0 nem nos usuários reais.
begin;
delete from public.itens
 where turma_id in (select id from public.turmas where nome = 'TESTE Turma v1')
    or instrutor_id in (select id from public.usuarios where email like '%@senac-agenda.test');
delete from public.historico where item_id not in (select id from public.itens);
delete from public.turmas where nome = 'TESTE Turma v1';
delete from public.cursos where nome = 'TESTE Curso v1';
delete from public.usuarios where email like '%@senac-agenda.test';
delete from auth.users where email like '%@senac-agenda.test';
commit;
