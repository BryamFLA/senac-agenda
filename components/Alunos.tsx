'use client';
import { useCallback, useEffect, useState } from 'react';
import { buscarTodos, supabase } from '@/lib/supabase';
import { Aluno, Matricula, SITUACOES_MATRICULA, mensagemErro } from '@/lib/types';
import { useCadastros } from './Contexto';
import Modal from './Modal';
import { BarraFiltros, Busca, Filtro, SITUACOES, confereSituacao, normal } from './Filtros';

/** Campos do aluno vindos da tela: nome obrigatório; e-mail e código opcionais (vazio vira null). */
export function dadosAluno(f: { nome: string; email: string; codigo: string }) {
  return { nome: f.nome.trim(), email: f.email.trim().toLowerCase() || null, codigo: f.codigo.trim() || null };
}
export const emailValido = (e: string) => !e.trim() || /^\S+@\S+\.\S+$/.test(e.trim());

export default function Alunos() {
  const cad = useCadastros();
  const [alunos, setAlunos] = useState<Aluno[] | null>(null);
  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [editar, setEditar] = useState<Aluno | 'novo' | null>(null);
  const [busca, setBusca] = useState('');
  const [turmaId, setTurmaId] = useState('');
  const [situacao, setSituacao] = useState('ativos');

  const carregar = useCallback(async () => {
    const [a, m] = await Promise.all([
      buscarTodos<Aluno>((de, ate) => supabase.from('alunos').select('*').order('nome').range(de, ate)),
      buscarTodos<Matricula>((de, ate) => supabase.from('matriculas').select('turma_id,aluno_id,situacao').range(de, ate)),
    ]);
    if (a.error || m.error) { setErro('Falha ao carregar os alunos.'); setAlunos([]); return; }
    setErro(null);
    setAlunos(a.data);
    setMatriculas(m.data);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const turma = new Map(cad.turmas.map((t) => [t.id, t]));
  const turmasDe = (id: string) => matriculas.filter((m) => m.aluno_id === id);
  const q = normal(busca.trim());
  const lista = (alunos ?? [])
    .filter((a) => confereSituacao(situacao, a.ativo))
    .filter((a) => !turmaId || (turmaId === 'sem' ? !turmasDe(a.id).length : turmasDe(a.id).some((m) => m.turma_id === turmaId)))
    .filter((a) => !q || normal(`${a.nome} ${a.email ?? ''} ${a.codigo ?? ''}`).includes(q));
  const turmasComAluno = cad.turmas.filter((t) => matriculas.some((m) => m.turma_id === t.id))
    .sort((a, b) => (b.codigo ?? '').localeCompare(a.codigo ?? ''));

  return (
    <section className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Alunos</h1>
          <p className="muted">Cadastro único de alunos. Um aluno pode existir sem turma e ser adicionado a uma ou mais turmas depois (no cadastro da turma).</p>
        </div>
        <span className="flex" />
        <button onClick={() => setEditar('novo')}>+ Novo aluno</button>
      </header>
      <BarraFiltros total={lista.length} rotulo={['aluno', 'alunos']}>
        <Busca valor={busca} onChange={setBusca} placeholder="Buscar por nome, e-mail ou código" />
        <Filtro rotulo="Turma" valor={turmaId} onChange={setTurmaId}
                opcoes={[{ valor: '', nome: 'Todas' }, { valor: 'sem', nome: 'Sem turma' },
                         ...turmasComAluno.map((t) => ({ valor: t.id, nome: t.codigo ?? t.nome }))]} />
        <Filtro rotulo="Situação" valor={situacao} onChange={setSituacao} opcoes={SITUACOES} />
      </BarraFiltros>
      {erro && <p className="erro">{erro}</p>}
      {alunos && !lista.length && (
        <p className="muted vazio">{alunos.length ? 'Nenhum aluno com esses filtros.' : 'Nenhum aluno cadastrado ainda.'}</p>
      )}
      <div className="tabela-rolagem" hidden={!lista.length}>
        <table className="tabela">
          <thead><tr><th>Nome</th><th>E-mail institucional</th><th>Código</th><th>Turmas</th><th>Situação</th></tr></thead>
          <tbody>
            {lista.map((a) => (
              <tr key={a.id} className="clicavel" onClick={() => setEditar(a)}>
                <td>{a.nome}</td>
                <td className="muted">{a.email ?? '—'}</td>
                <td className="muted">{a.codigo ?? '—'}</td>
                <td>
                  {turmasDe(a.id).map((m) => (
                    <span key={m.turma_id} className={`chip-turma ${m.situacao === 'desligado' ? 'desligado' : ''}`}
                          style={{ '--c': turma.get(m.turma_id)?.cor } as React.CSSProperties}
                          title={m.situacao === 'desligado' ? 'Desligado desta turma' : undefined}>
                      {turma.get(m.turma_id)?.codigo ?? turma.get(m.turma_id)?.nome}
                    </span>
                  ))}
                  {!turmasDe(a.id).length && <span className="muted">—</span>}
                </td>
                <td>{a.ativo ? 'Ativo' : <span className="muted">Inativo</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editar && (
        <EditarAluno aluno={editar === 'novo' ? null : editar} matriculas={editar === 'novo' ? [] : turmasDe(editar.id)}
                     onClose={() => setEditar(null)} onSalvo={carregar} />
      )}
    </section>
  );
}

function EditarAluno({ aluno, matriculas, onClose, onSalvo }: {
  aluno: Aluno | null; matriculas: Matricula[]; onClose: () => void; onSalvo: () => void;
}) {
  const cad = useCadastros();
  const [f, setF] = useState({ nome: aluno?.nome ?? '', email: aluno?.email ?? '', codigo: aluno?.codigo ?? '', ativo: aluno?.ativo ?? true });
  const [novaTurma, setNovaTurma] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const turma = new Map(cad.turmas.map((t) => [t.id, t]));
  const livres = cad.turmas.filter((t) => t.ativo && !matriculas.some((m) => m.turma_id === t.id))
    .sort((a, b) => (b.codigo ?? '').localeCompare(a.codigo ?? ''));

  async function salvar() {
    setErro(null);
    if (!f.nome.trim()) return setErro('Informe o nome do aluno.');
    if (!emailValido(f.email)) return setErro('E-mail inválido.');
    const dados = { ...dadosAluno(f), ativo: f.ativo };
    const r = aluno ? await supabase.from('alunos').update(dados).eq('id', aluno.id).select('id').single()
      : await supabase.from('alunos').insert(dados).select('id').single();
    if (r.error) return setErro(mensagemErro(r.error));
    if (novaTurma) {
      const { error } = await supabase.from('matriculas').insert({ turma_id: novaTurma, aluno_id: r.data.id });
      if (error) return setErro(mensagemErro(error));
    }
    onSalvo();
    onClose();
  }

  return (
    <Modal titulo={aluno ? aluno.nome : 'Novo aluno'} onClose={onClose}
           rodape={<><span className="flex" /><button className="secundario" onClick={onClose}>Cancelar</button><button onClick={salvar}>Salvar</button></>}>
      <label className="campo">Nome<input value={f.nome} autoFocus={!aluno} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
      <label className="campo">E-mail institucional <span className="opcional">(opcional)</span>
        <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="nome.sobrenome@…" />
      </label>
      <label className="campo">Código do aluno <span className="opcional">(CodAluno, opcional)</span>
        <input value={f.codigo} inputMode="numeric" onChange={(e) => setF({ ...f, codigo: e.target.value.trim() })} />
      </label>
      {aluno && (
        <div className="campo"><span>Turmas</span>
          {matriculas.length ? (
            <div className="chips">
              {matriculas.map((m) => (
                <span key={m.turma_id} className={`chip-turma ${m.situacao === 'desligado' ? 'desligado' : ''}`}
                      style={{ '--c': turma.get(m.turma_id)?.cor } as React.CSSProperties}>
                  {turma.get(m.turma_id)?.codigo ?? turma.get(m.turma_id)?.nome}
                  {m.situacao === 'desligado' && ` · ${SITUACOES_MATRICULA[1].nome.toLowerCase()}`}
                </span>
              ))}
            </div>
          ) : <span className="muted">Ainda sem turma.</span>}
        </div>
      )}
      <label className="campo">Adicionar a uma turma <span className="opcional">(opcional)</span>
        <select value={novaTurma} onChange={(e) => setNovaTurma(e.target.value)}>
          <option value="">Não adicionar agora</option>
          {livres.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Aluno ativo</label>
      {erro && <p className="erro">{erro}</p>}
    </Modal>
  );
}
