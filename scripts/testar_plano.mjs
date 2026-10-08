// Confere a segmentação do plano de curso contra PDFs reais.
// Uso: node --experimental-strip-types scripts/testar_plano.mjs "<arquivo.pdf>" [...]
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { linhasDaPagina, segmentarPlano } from '../lib/plano.ts';

for (const arquivo of process.argv.slice(2)) {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(arquivo)), verbosity: 0 }).promise;
  let texto = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const pagina = await pdf.getPage(p);
    texto += linhasDaPagina((await pagina.getTextContent()).items) + '\n';
  }
  const { geral, ucs } = segmentarPlano(texto);
  console.log(`\n=== ${arquivo.split(/[\\/]/).pop()} (${pdf.numPages} págs, ${texto.length} chars)`);
  console.log(`geral: ${geral.length} chars | UCs: ${ucs.map((u) => u.numero).join(', ')}`);
  for (const u of ucs) {
    const ch = u.texto.match(/Carga\s+hor[áa]ria:\s*([\d.,]+)/i)?.[1];
    const ind = /Indicadores/i.test(u.texto);
    console.log(`  UC${u.numero}: ${u.texto.length} chars, CH ${ch ?? '?'}, indicadores ${ind ? 'sim' : 'NÃO'} | ${u.texto.slice(0, 70).replace(/\s+/g, ' ')}`);
  }
}
