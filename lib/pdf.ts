// Extrai o texto de um PDF no navegador (pdf.js carregado só quando a TEPT importa um plano).
import { linhasDaPagina } from './plano';

export async function textoDoPdf(arquivo: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  const paginas: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const conteudo = await (await pdf.getPage(p)).getTextContent();
    paginas.push(linhasDaPagina(conteudo.items as { str: string; hasEOL?: boolean }[]));
  }
  return paginas.join('\n');
}
