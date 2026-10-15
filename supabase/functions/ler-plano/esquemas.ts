// Formato de saída pedido à Claude API para cada parte do plano de curso.

const texto = { type: 'string' };
const textoOuNulo = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const lista = { type: 'array', items: texto };

export const ESQUEMA_GERAL = {
  type: 'object',
  additionalProperties: false,
  required: ['nome', 'eixo', 'segmento', 'ch_total', 'codigo_dn', 'cbo', 'ucs'],
  properties: {
    nome: texto,
    eixo: textoOuNulo,
    segmento: textoOuNulo,
    ch_total: { type: 'number' },
    codigo_dn: textoOuNulo,
    cbo: textoOuNulo,
    ucs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['numero', 'nome', 'ch', 'tipo', 'integra'],
        properties: {
          numero: { type: 'integer' },
          nome: texto,
          ch: { type: 'number' },
          tipo: { type: 'string', enum: ['regular', 'projeto_integrador'] },
          integra: { type: 'array', items: { type: 'integer' } },
        },
      },
    },
  },
};

export const ESQUEMA_UC = {
  type: 'object',
  additionalProperties: false,
  required: ['numero', 'nome', 'ch', 'indicadores', 'conhecimentos', 'habilidades', 'atitudes'],
  properties: {
    numero: { type: 'integer' },
    nome: texto,
    ch: { type: 'number' },
    indicadores: lista,
    conhecimentos: lista,
    habilidades: lista,
    atitudes: lista,
  },
};

const REGRAS = `Regras:
- Copie o texto exatamente como está no plano, em português, sem corrigir, resumir nem reescrever (inclusive erros do original).
- O texto veio de um PDF: junte as linhas quebradas no meio de uma frase e remova marcadores de lista ("•", "1.", "-") do início dos itens.
- Ignore cabeçalhos repetidos de página ("Elementos da Competência", "Indicadores", "Unidades Curriculares") que aparecem no meio de uma lista.
- Cargas horárias em horas, como número (ex.: "1.000 horas" = 1000).`;

export const SISTEMA_GERAL = `Você extrai dados de planos de curso do Senac para um sistema de agenda.
Recebe o início do plano (identificação do curso e organização curricular) e devolve:
- dados de identificação do curso (título, eixo tecnológico, segmento, carga horária total, código DN, código CBO; null se não houver);
- todas as Unidades Curriculares da tabela de organização curricular, com número, nome e carga horária.
Marque como "projeto_integrador" as UCs de Projeto Integrador e preencha "integra" com os números das UCs do mesmo bloco
(na tabela, o Projeto Integrador aparece ao lado das UCs que ele integra). Para as demais UCs, "integra" é [].
Linhas de qualificação/certificação intermediária não são UCs.
${REGRAS}`;

export const SISTEMA_UC = `Você extrai o detalhamento de uma Unidade Curricular de um plano de curso do Senac.
Devolva número, nome, carga horária e as listas de indicadores, conhecimentos, habilidades e atitudes/valores.
Se a UC for um Projeto Integrador, ela não tem conhecimentos, habilidades nem atitudes próprios: devolva essas listas vazias
e use como indicadores os "Indicadores para avaliação" do Projeto Integrador.
Cada item de conhecimento mantém o formato "Tema: detalhes" do original.
${REGRAS}`;
