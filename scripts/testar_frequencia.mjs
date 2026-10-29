// Confere a leitura da lista de alunos (PDF "Usuários AD" do Senac) contra PDFs reais.
// Uso: node --experimental-strip-types scripts/testar_frequencia.mjs "<lista.pdf>" [...]
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { linhasDaPagina } from '../lib/plano.ts';
import { lerListaAlunos } from '../lib/frequencia.ts';

for (const arquivo of process.argv.slice(2)) {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(arquivo)), verbosity: 0 }).promise;
  let texto = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    texto += linhasDaPagina((await (await pdf.getPage(p)).getTextContent()).items) + '\n';
  }
  const { alunos, turmas, ignoradas } = lerListaAlunos(texto);
  console.log(`\n=== ${arquivo.split(/[\\/]/).pop()} (${pdf.numPages} págs) — turma(s) ${turmas.join(', ') || '?'}: ${alunos.length} alunos`);
  for (const a of alunos) console.log(`  ${a.codigo.padStart(8)}  ${a.nome.padEnd(36)} ${a.email}`);
  for (const l of ignoradas) console.log(`  IGNORADA: ${l}`);
}
