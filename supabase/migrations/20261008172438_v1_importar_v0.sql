-- =============================================================
-- v1 — importa usuários e a agenda da v0
-- Os registros da v0 viram eventos do Bryam (origem 'v0'): não têm UC, então a TEPT
-- converte em aula pela edição. As regras do RH são ignoradas só nesta importação.
-- =============================================================
select set_config('app.ignorar_regras', 'on', true);

insert into public.usuarios (id, email, nome, papel, leciona)
select u.id, e.email,
       case when e.papel = 'admin' then 'Bryam Assolini' else e.nome end,
       case when e.papel = 'admin' then 'admin' else 'tept' end,
       e.papel = 'admin'
from public.editores e
join auth.users u on lower(u.email) = e.email;

insert into public.itens (tipo, data, hora_inicio, hora_fim, instrutor_id, titulo, cor, trabalho, observacao,
                          origem, created_at, updated_at, updated_by)
select 'evento', a.data,
       coalesce(a.hora_inicio, t.ini),
       case when a.hora_fim is not null and a.hora_fim > coalesce(a.hora_inicio, t.ini) then a.hora_fim
            when a.hora_inicio is null then t.fim
            else greatest(t.fim, a.hora_inicio + interval '1 hour')::time end,
       (select id from public.usuarios where papel = 'admin' and leciona limit 1),
       c.nome, c.cor,
       c.tipo not in ('feriado', 'ferias', 'folga'),
       coalesce(nullif(trim(a.observacao), ''), c.subtitulo),
       'v0', a.created_at, a.updated_at, a.updated_by
from public.agenda a
join public.compromissos c on c.id = a.compromisso_id
join (values ('M'::public.turno, time '08:00', time '12:00'),
             ('T'::public.turno, time '13:30', time '17:30'),
             ('N'::public.turno, time '19:00', time '22:00')) as t(turno, ini, fim) on t.turno = a.turno;
