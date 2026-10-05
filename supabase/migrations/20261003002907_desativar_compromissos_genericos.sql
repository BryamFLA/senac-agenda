-- Itens genéricos saem da lista de opções: eventos têm nome/código próprios e são cadastrados quando surgem.
-- Desativados (não apagados) para manter os registros já existentes na agenda.
update public.compromissos set ativo = false
where nome in ('Evento','Folga','Palestra','Planejamento','Reunião','Viagem','Workshop');
