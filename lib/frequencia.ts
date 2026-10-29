// Lê a lista de alunos da turma exportada do sistema do Senac ("Usuários AD - Consultas de Usuários AD").
// Função pura (sem PDF, sem rede) para poder ser testada com PDFs reais (scripts/testar_frequencia.mjs).
// Cada linha da tabela: UEPT TurCod AlunoCod Aluno UsuarioAD IntegracaoOrion SituacaoAD Obs — o nome pode vir
// quebrado em várias linhas, sempre entre o código do aluno e o e-mail.

export interface AlunoLista { turma: string; codigo: string; nome: string; email: string }
export interface Lista { alunos: AlunoLista[]; turmas: string[]; ignoradas: string[] }

const LINHA = /(?:^|\n)[ \t]*\d{1,3}[ \t]+(\d{9})[ \t]+(\d{4,10})[ \t]+([\s\S]+?)\s+([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const NOME = /^[\p{L}][\p{L}\s'.-]*$/u;

export function lerListaAlunos(texto: string): Lista {
  const alunos: AlunoLista[] = [];
  const ignoradas: string[] = [];
  const vistos = new Set<string>();
  for (const m of texto.matchAll(LINHA)) {
    const nome = m[3].replace(/\s+/g, ' ').trim();
    // linha quebrada entre páginas (cabeçalho/rodapé no meio do nome): melhor avisar do que gravar lixo
    if (!NOME.test(nome)) { ignoradas.push(`${m[2]} ${nome.slice(0, 60)}`); continue; }
    if (vistos.has(m[2])) continue;
    vistos.add(m[2]);
    alunos.push({ turma: m[1], codigo: m[2], nome, email: m[4].toLowerCase() });
  }
  return { alunos, turmas: [...new Set(alunos.map((a) => a.turma))], ignoradas };
}
