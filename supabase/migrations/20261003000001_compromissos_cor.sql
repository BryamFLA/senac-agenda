-- Cada compromisso tem uma cor própria (escolhida no cadastro) usada para pintar o cartão na agenda.
update public.compromissos c set cor = v.cor
from (values
  ('Técnico Inf. Internet', '#004A8D'),
  ('Técnico IA - Seed', '#7C3AED'),
  ('Programador Web', '#0E9F6E'),
  ('Assistente de TI', '#F7941D'),
  ('Instagram para Negócios', '#DB2777'),
  ('Criação de Mídias Sociais T1', '#0891B2'),
  ('Criação de Mídias Sociais T2', '#CA8A04'),
  ('Assistente Administrativo Flexível', '#65A30D'),
  ('Cabeleireiro', '#C026D3'),
  ('Auxiliar de Confeitaria', '#E11D48'),
  ('Aprendizagem Administrativo', '#4F46E5'),
  ('Aprendizagem Vendas', '#EA580C'),
  ('Planejamento', '#64748B'),
  ('Workshop', '#B45309'),
  ('Palestra', '#9333EA'),
  ('Reunião', '#475569'),
  ('Formação pedagógica', '#0F766E'),
  ('Viagem', '#0369A1'),
  ('Evento', '#A16207'),
  ('Feriado', '#DC2626'),
  ('Férias', '#16A34A'),
  ('Folga', '#94A3B8')
) as v(nome, cor)
where c.nome = v.nome;

update public.compromissos set cor = '#004A8D' where cor is null;

alter table public.compromissos
  alter column cor set default '#004A8D',
  alter column cor set not null,
  add constraint compromissos_cor_hex check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  alter column tipo set default 'outro';

comment on column public.compromissos.cor is 'Cor do cartão na agenda (#RRGGBB), escolhida no cadastro.';
comment on column public.compromissos.tipo is 'Uso interno (horário/dia inteiro e automações); não aparece na tela.';
