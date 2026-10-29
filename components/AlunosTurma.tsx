'use client';
import { useCallback, useEffect, useState } from 'react';
import { buscarTodos, supabase } from '@/lib/supabase';
import { Aluno, SITUACOES_MATRICULA, SituacaoMatricula, Turma, mensagemErro } from '@/lib/types';
import { textoDoPdf } from '@/lib/pdf';
import { normal } from './Filtros';
import { dadosAluno, emailValido } from './Alunos';

interface Linha { situacao: SituacaoMatricula; aluno: Aluno }

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

  const carregar = useCallback(async () => {
    const [m, a, f] = await Promise.all([
      supabase.from('matriculas').select('situacao, aluno:alunos(id,nome,email,codigo,ativo)').eq('turma_id', turma.id),
      buscarTodos<Aluno>((de, ate) => supabase.from('alunos').select('*').eq('ativo', true).order('nome').range(de, ate)),
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

  // leitura automática da lista de frequência fica para depois: por enquanto só recebe o PDF
  async function importarPdf(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null); setAviso(null); setLendo(true);
    try {
      const texto = await textoDoPdf(arquivo);
      const linhasLidas = texto.split('\n').filter((l) => l.trim()).length;
      setAviso(`Lista recebida (${linhasLidas} linhas de texto). A identificação automática dos alunos ainda vai ser feita; por enquanto, adicione-os pela busca acima.`);
    } catch {
      setErro('Não consegui ler esse PDF.');
    } finally {
      setLendo(false);
    }
  }

  const naTurma = new Set(linhas?.map((l) => l.aluno.id));
  const q = normal(busca.trim());
  const sugestoes = q ? todos.filter((a) => !naTurma.has(a.id) && normal(`${a.nome} ${a.email ?? ''} ${a.codigo ?? ''}`).includes(q)).slice(0, 8) : [];
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
