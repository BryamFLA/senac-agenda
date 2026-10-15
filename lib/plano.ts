// Corta o texto de um plano de curso do Senac nas partes enviadas ao leitor com IA.
// Função pura (sem PDF, sem rede) para poder ser testada com os planos reais (scripts/testar_plano.mjs).

export interface PartesPlano {
  geral: string; // identificação + organização curricular (tudo antes do detalhamento)
  ucs: { numero: number; texto: string }[]; // detalhamento de cada UC, na ordem do plano
}

// Variações vistas: "Unidade Curricular 1:", "UC 1:", "UC2:", "Unidade Curricular:" (sem número, planos por ano letivo)
const CABECALHO = /^[ \t]*(?:Unidade\s+Curricular|UC)[ \t]*(\d+)?[ \t]*:/gim;
const INICIO_DETALHE = /Detalhamento\s+das\s+Unidades\s+Curriculares/i;
const FIM_DETALHE = /^[ \t]*(?:\d+\.?[ \t]*)?Orienta[çc][õo]es\s+Metodol[óo]gicas/im;

export function segmentarPlano(texto: string): PartesPlano {
  const ancora = texto.search(INICIO_DETALHE);
  const todos = [...texto.matchAll(CABECALHO)].map((m) => ({
    numero: m[1] ? Number(m[1]) : null,
    pos: m.index!,
  }));
  // sem a âncora "Detalhamento...", o detalhe começa no primeiro "Unidade Curricular N:" (a tabela usa "UC1:")
  const inicio = ancora >= 0
    ? ancora
    : (todos.find((c) => c.numero !== null && /^\s*Unidade/i.test(texto.slice(c.pos, c.pos + 12)))?.pos ?? -1);
  if (inicio < 0) return { geral: texto, ucs: [] };

  const fimRel = texto.slice(inicio).search(FIM_DETALHE);
  const fim = fimRel >= 0 ? inicio + fimRel : texto.length;
  const cabecalhos = todos.filter((c) => c.pos >= inicio && c.pos < fim);
  if (!cabecalhos.length) return { geral: texto, ucs: [] };

  let seq = 0;
  const trechos = cabecalhos.map((c, i) => ({
    numero: c.numero ?? ++seq,
    texto: texto.slice(c.pos, i + 1 < cabecalhos.length ? cabecalhos[i + 1].pos : fim),
  }));

  // Projetos Integradores podem vir agrupados (só nome + CH) antes do texto comum, e o texto comum pode
  // citar "UC5:" de novo nos temas geradores: cada UC vai até juntar um trecho com "Indicadores".
  const ucs: PartesPlano['ucs'] = [];
  const vistos = new Set<number>();
  trechos.forEach((t, i) => {
    if (vistos.has(t.numero)) return;
    vistos.add(t.numero);
    let corpo = t.texto;
    for (let j = i + 1; !/Indicadores/i.test(corpo) && j < trechos.length; j++) corpo += trechos[j].texto;
    ucs.push({ numero: t.numero, texto: corpo.trim() });
  });

  return { geral: texto.slice(0, inicio).trim(), ucs };
}

/** Junta os itens de texto de uma página do pdf.js em linhas. */
export function linhasDaPagina(itens: { str: string; hasEOL?: boolean }[]): string {
  return itens.map((i) => i.str + (i.hasEOL ? '\n' : '')).join('');
}
