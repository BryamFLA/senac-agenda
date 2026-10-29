'use client';
import { useCallback, useEffect, useState } from 'react';
import { buscarTodos, supabase } from '@/lib/supabase';
import { Aluno, SITUACOES_MATRICULA, SituacaoMatricula, Turma, mensagemErro } from '@/lib/types';
import { textoDoPdf } from '@/lib/pdf';
import { AlunoLista, Lista, lerListaAlunos } from '@/lib/frequencia';
import { normal } from './Filtros';
import { dadosAluno, emailValido } from './Alunos';

interface Linha { situacao: SituacaoMatricula; aluno: Aluno }

/** Cada aluno lido do PDF e o que a importação vai fazer com ele. */
interface ItemPrevia {
  lido: AlunoLista;
  acao: 'novo' | 'existe' | 'na_turma';
  aluno?: Aluno; // cadastro encontrado (pelo código ou pelo e-mail)
  diferencas: string[]; // o cadastro é mantido; só avisa
  completar: { email?: string; codigo?: string }; // campos vazios no cadastro que o PDF preenche
}

function montarPrevia(lista: Lista, todos: Aluno[], naTurma: Set<string>): ItemPrevia[] {
  const comEmail = new Set(todos.map((a) => a.email).filter(Boolean));
  return lista.alunos.map((lido): ItemPrevia => {
    const aluno = todos.find((a) => a.codigo === lido.codigo) ?? todos.find((a) => a.email === lido.email);
    if (!aluno) return { lido, acao: 'novo', diferencas: [], completar: {} };
    const diferencas: string[] = [];
    if (normal(aluno.nome) !== normal(lido.nome)) diferencas.push(`nome no PDF: ${lido.nome}`);
    if (aluno.email && aluno.email !== lido.email) diferencas.push(`e-mail no PDF: ${lido.email}`);
    if (aluno.codigo && aluno.codigo !== lido.codigo) diferencas.push(`código no PDF: ${lido.codigo}`);
    const completar: ItemPrevia['completar'] = {};
    if (!aluno.email && !comEmail.has(lido.email)) completar.email = lido.email;
    if (!aluno.codigo) completar.codigo = lido.codigo;
    return { lido, aluno, acao: naTurma.has(aluno.id) ? 'na_turma' : 'existe', diferencas, completar };
  });
}

const ROTULO_ACAO = { novo: 'Novo cadastro', existe: 'Já cadastrado', na_turma: 'Já na turma' };

/** Alunos de uma turma (dentro do cadastro da turma). Cada mudança grava na hora. */
export default function AlunosTurma({ turma }: { turma: Turma }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [todos, setTodos] = useState<Aluno[]>([]);
  const [horas, setHoras] = useState<Map<string, { horas: number; faltas: number }>>(new Map());
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState<{ nome: string; email: string; codigo: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [previa, setPrevia] = useState<{ itens: ItemPrevia[]; lista: Lista; arquivo: string } | null>(null);
  const [outraTurmaOk, setOutraTurmaOk] = useState(false);
  const [gravando, setGravando] = useState(false);

  const carregar = useCallback(async () => {
    const [m, a, f] = await Promise.all([
      supabase.from('matriculas').select('situacao, aluno:alunos(id,nome,email,codigo,ativo)').eq('turma_id', turma.id),
      buscarTodos<Aluno>((de, ate) => supabase.from('alunos').select('*').order('nome').range(de, ate)),
      supabase.from('frequencia').select('aluno_id,horas,faltas').eq('turma_id', turma.id),
    ]);
    if (m.error || a.error || f.error) { setErro('Falha ao carregar os alunos da turma.'); setLinhas([]); return; }
    setLinhas((m.data as unknown as Linha[]).filter((l) => l.aluno).sort((x, y) => x.aluno.nome.localeCompare(y.aluno.nome, 'pt-BR')));
    setTodos(a.data);
    setHoras(new Map((f.data ?? []).map((r) => [r.aluno_id as string, { horas: Number(r.horas), faltas: Number(r.faltas) }])));
  }, [turma.id]);
  useEffect(() => { carregar(); }, [carregar]);

  async function adicionar(alunoId: string) {
    setErro(null); setAviso(null);
    const { error } = await supabase.from('matriculas').insert({ turma_id: turma.id, aluno_id: alunoId });
    if (error) return setErro(mensagemErro(error));
    setBusca('');
    carregar();
  }

  async function cadastrarNovo() {
    if (!novo) return;
    setErro(null);
    if (!novo.nome.trim()) return setErro('Informe o nome do aluno.');
    if (!emailValido(novo.email)) return setErro('E-mail inválido.');
    const r = await supabase.from('alunos').insert(dadosAluno(novo)).select('id').single();
    if (r.error) return setErro(mensagemErro(r.error));
    setNovo(null);
    adicionar(r.data.id);
  }

  async function mudarSituacao(alunoId: string, situacao: SituacaoMatricula) {
    setErro(null);
    const { error } = await supabase.from('matriculas').update({ situacao }).eq('turma_id', turma.id).eq('aluno_id', alunoId);
    if (error) return setErro(mensagemErro(error));
    setLinhas((ls) => ls?.map((l) => (l.aluno.id === alunoId ? { ...l, situacao } : l)) ?? null);
  }

  async function remover(alunoId: string) {
    setErro(null);
    const { error } = await supabase.from('matriculas').delete().eq('turma_id', turma.id).eq('aluno_id', alunoId);
    if (error) return setErro(mensagemErro(error, 'Não foi possível remover.'));
    carregar();
  }

  // PDF "Usuários AD" do sistema do Senac → prévia → grava (novos cadastros + matrículas)
  async function importarPdf(arquivo: File | undefined) {
    if (!arquivo || !linhas) return;
    setErro(null); setAviso(null); setPrevia(null); setOutraTurmaOk(false); setLendo(true);
    try {
      const lista = lerListaAlunos(await textoDoPdf(arquivo));
      if (!lista.alunos.length) {
        setErro('Não encontrei alunos nesse PDF. Use a consulta "Usuários AD" do sistema do Senac, exportada em PDF.');
        return;
      }
      setPrevia({ itens: montarPrevia(lista, todos, new Set(linhas.map((l) => l.aluno.id))), lista, arquivo: arquivo.name });
    } catch {
      setErro('Não consegui ler esse PDF.');
    } finally {
      setLendo(false);
    }
  }

  async function gravarPrevia() {
    if (!previa) return;
    setErro(null); setGravando(true);
    try {
      const novos = previa.itens.filter((i) => i.acao === 'novo');
      let ids: string[] = [];
      if (novos.length) {
        const r = await supabase.from('alunos')
          .insert(novos.map((i) => ({ nome: i.lido.nome, email: i.lido.email, codigo: i.lido.codigo }))).select('id');
        if (r.error) return setErro(mensagemErro(r.error, 'Não foi possível cadastrar os alunos novos.'));
        ids = (r.data ?? []).map((x) => x.id as string);
      }
      for (const i of previa.itens) {
        if (!i.aluno || (!i.completar.email && !i.completar.codigo)) continue;
        const { error } = await supabase.from('alunos').update(i.completar).eq('id', i.aluno.id);
        if (error) return setErro(`${i.lido.nome}: ${mensagemErro(error)}`);
      }
      ids = ids.concat(previa.itens.filter((i) => i.acao === 'existe').map((i) => i.aluno!.id));
      if (ids.length) {
        const { error } = await supabase.from('matriculas').insert(ids.map((aluno_id) => ({ turma_id: turma.id, aluno_id })));
        if (error) return setErro(mensagemErro(error, 'Os cadastros foram feitos, mas não consegui pôr os alunos na turma. Importe de novo.'));
      }
      setAviso(`${ids.length} aluno(s) adicionado(s) à turma${novos.length ? ` (${novos.length} cadastro(s) novo(s))` : ''}.`);
      setPrevia(null);
      carregar();
    } finally {
      setGravando(false);
    }
  }

  const naTurma = new Set(linhas?.map((l) => l.aluno.id));
  const q = normal(busca.trim());
  const sugestoes = q ? todos.filter((a) => a.ativo && !naTurma.has(a.id) && normal(`${a.nome} ${a.email ?? ''} ${a.codigo ?? ''}`).includes(q)).slice(0, 8) : [];
  const normais = linhas?.filter((l) => l.situacao === 'normal').length ?? 0;

  return (
    <div className="alunos-turma">
      <div className="secao-topo">
        <h3>Alunos <span className="muted">({normais}{linhas && linhas.length > normais ? ` + ${linhas.length - normais} desligado(s)` : ''})</span></h3>
        <label className={`botao secundario ${lendo ? 'carregando' : ''}`}>
          {lendo ? 'Lendo…' : 'Importar lista de frequência (PDF)'}
          <input type="file" accept="application/pdf,.pdf" hidden disabled={lendo}
                 onChange={(e) => { importarPdf(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
      <p className="muted pequeno">As mudanças nesta seção são gravadas na hora.</p>

      {!novo ? (
        <div className="busca-aluno">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Adicionar aluno: busque por nome, e-mail ou código"
                 aria-label="Buscar aluno para adicionar" />
          {q && (
            <ul className="sugestoes" role="listbox">
              {sugestoes.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => adicionar(a.id)}>
                    <span>{a.nome}</span><span className="muted pequeno">{[a.codigo, a.email].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
              <li>
                <button type="button" className="novo-aluno" onClick={() => { setNovo({ nome: busca.trim(), email: '', codigo: '' }); setBusca(''); }}>
                  + Cadastrar “{busca.trim()}” como novo aluno
                </button>
              </li>
            </ul>
          )}
        </div>
      ) : (
        <div className="novo">
          <strong>Novo aluno nesta turma</strong>
          <label className="campo">Nome<input value={novo.nome} autoFocus onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></label>
          <div className="grade-campos">
            <label className="campo">E-mail institucional <span className="opcional">(opcional)</span>
              <input type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
            </label>
            <label className="campo">Código <span className="opcional">(opcional)</span>
              <input value={novo.codigo} inputMode="numeric" onChange={(e) => setNovo({ ...novo, codigo: e.target.value.trim() })} />
            </label>
          </div>
          <div className="flex-linha">
            <span className="flex" />
            <button type="button" className="secundario" onClick={() => setNovo(null)}>Cancelar</button>
            <button type="button" onClick={cadastrarNovo}>Cadastrar e adicionar</button>
          </div>
        </div>
      )}

      {previa && (() => {
        const outraTurma = !previa.lista.turmas.includes(turma.codigo ?? '');
        const entram = previa.itens.filter((i) => i.acao !== 'na_turma').length;
        const novos = previa.itens.filter((i) => i.acao === 'novo').length;
        return (
          <div className="novo importacao">
            <div className="secao-topo">
              <strong>Importar “{previa.arquivo}”</strong>
              <span className="muted pequeno">{previa.itens.length} aluno(s) no PDF · {novos} novo(s) · {entram} entram na turma</span>
            </div>
            {outraTurma && (
              <div className="alerta conflito">
                <strong>⚠ Este PDF é de outra turma</strong>
                <span>O PDF traz a turma {previa.lista.turmas.join(', ')}, mas esta é a {turma.codigo ?? turma.nome}.</span>
                <label className="check"><input type="checkbox" checked={outraTurmaOk} onChange={(e) => setOutraTurmaOk(e.target.checked)} /> Importar nesta turma mesmo assim</label>
              </div>
            )}
            {previa.lista.ignoradas.length > 0 && (
              <p className="nota">Não consegui ler {previa.lista.ignoradas.length} linha(s) (provavelmente quebradas entre páginas): {previa.lista.ignoradas.join('; ')}. Adicione esses alunos pela busca.</p>
            )}
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead><tr><th>Aluno no PDF</th><th>O que acontece</th></tr></thead>
                <tbody>
                  {previa.itens.map((i) => (
                    <tr key={i.lido.codigo} className={i.acao === 'na_turma' ? 'apagada' : ''}>
                      <td>
                        <div className="aluno-nome">{i.lido.nome}</div>
                        <div className="aluno-meta">Cód. {i.lido.codigo} · {i.lido.email}</div>
                      </td>
                      <td>
                        <span className={`selo-acao ${i.acao}`}>{ROTULO_ACAO[i.acao]}</span>
                        {i.aluno && !i.aluno.ativo && <span className="muted pequeno"> (inativo no cadastro)</span>}
                        {i.diferencas.length > 0 && (
                          <div className="aluno-meta" title="O cadastro existente é mantido">Cadastro mantido · {i.diferencas.join(' · ')}</div>
                        )}
                        {(i.completar.email || i.completar.codigo) && (
                          <div className="aluno-meta">Completa o cadastro com {[i.completar.codigo && 'o código', i.completar.email && 'o e-mail'].filter(Boolean).join(' e ')}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex-linha">
              <span className="flex" />
              <button type="button" className="secundario" onClick={() => setPrevia(null)} disabled={gravando}>Cancelar</button>
              <button type="button" onClick={gravarPrevia} disabled={gravando || !entram || (outraTurma && !outraTurmaOk)}>
                {gravando ? 'Gravando…' : entram ? `Adicionar ${entram} à turma` : 'Todos já estão na turma'}
              </button>
            </div>
          </div>
        );
      })()}

      {aviso && <p className="nota">{aviso}</p>}
      {erro && <p className="erro">{erro}</p>}

      {!linhas ? <p className="muted">Carregando…</p> : !linhas.length ? (
        <p className="muted">Nenhum aluno na turma ainda.</p>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead><tr><th className="num">#</th><th>Aluno</th><th>Situação</th><th>Faltas</th><th /></tr></thead>
            <tbody>
              {linhas.map((l, i) => {
                const fr = horas.get(l.aluno.id);
                return (
                  <tr key={l.aluno.id} className={l.situacao === 'desligado' ? 'desligado' : ''}>
                    <td className="num">{i + 1}</td>
                    <td>
                      <div className="aluno-nome">{l.aluno.nome}</div>
                      <div className="aluno-meta">{[l.aluno.codigo && `Cód. ${l.aluno.codigo}`, l.aluno.email].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                    <td>
                      <select value={l.situacao} onChange={(e) => mudarSituacao(l.aluno.id, e.target.value as SituacaoMatricula)}
                              aria-label={`Situação de ${l.aluno.nome}`}>
                        {SITUACOES_MATRICULA.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                      </select>
                    </td>
                    <td title={fr ? `${fr.faltas} falta(s) em ${fr.horas} hora(s)-aula com chamada` : 'Sem chamada ainda'}>
                      {fr ? `${fr.faltas} de ${fr.horas} h` : '—'}
                    </td>
                    <td>
                      {fr ? <span className="muted pequeno" title="Já tem chamada: para tirar da turma, marque como desligado">com chamada</span>
                        : <button type="button" className="link" onClick={() => remover(l.aluno.id)}>Remover</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
