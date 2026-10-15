'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CORES, Turma, mensagemErro } from '@/lib/types';
import { ddmm, deIso } from '@/lib/datas';
import { useCadastros } from './Contexto';
import Modal, { SeletorCor } from './Modal';
import { BarraFiltros, Busca, Filtro, SITUACOES, confereSituacao, normal } from './Filtros';

/** A turma não tem nome próprio: é o código + o curso. O banco guarda esse texto em turmas.nome. */
export const nomeAutomatico = (codigo: string, curso: string) => `${codigo} · ${curso}`;

const fmtData = (s: string | null) => (s ? `${ddmm(deIso(s))}/${s.slice(0, 4)}` : '…');

export default function Turmas() {
  const cad = useCadastros();
  const [editar, setEditar] = useState<Turma | 'nova' | null>(null);
  const [busca, setBusca] = useState('');
  const [cursoId, setCursoId] = useState('');
  const [situacao, setSituacao] = useState('ativos');
  const curso = new Map(cad.cursos.map((c) => [c.id, c]));

  const q = normal(busca.trim());
  const lista = cad.turmas
    .filter((t) => confereSituacao(situacao, t.ativo))
    .filter((t) => !cursoId || t.curso_id === cursoId)
    .filter((t) => !q || normal(`${t.codigo ?? ''} ${t.nome} ${curso.get(t.curso_id)?.nome ?? ''}`).includes(q))
    .sort((a, b) => (b.codigo ?? '').localeCompare(a.codigo ?? '') || a.nome.localeCompare(b.nome, 'pt-BR'));
  const filtrando = !!(q || cursoId || situacao !== 'ativos');
  const cursosComTurma = cad.cursos.filter((c) => cad.turmas.some((t) => t.curso_id === c.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  return (
    <section className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Turmas</h1>
          <p className="muted">Cada turma faz o curso completo e é identificada pelo código. A cor pinta as aulas na agenda do instrutor.</p>
        </div>
        <span className="flex" />
        <button onClick={() => setEditar('nova')} disabled={!cad.cursos.length}
                title={cad.cursos.length ? '' : 'Cadastre um curso primeiro'}>+ Nova turma</button>
      </header>
      <BarraFiltros total={lista.length} rotulo={['turma', 'turmas']}>
        <Busca valor={busca} onChange={setBusca} placeholder="Buscar por código ou curso" />
        <Filtro rotulo="Curso" valor={cursoId} onChange={setCursoId}
                opcoes={[{ valor: '', nome: 'Todos' }, ...cursosComTurma.map((c) => ({ valor: c.id, nome: c.nome }))]} />
        <Filtro rotulo="Situação" valor={situacao} onChange={setSituacao} opcoes={SITUACOES} />
      </BarraFiltros>
      {!lista.length && (
        <p className="muted vazio">
          {filtrando ? 'Nenhuma turma com esses filtros.' : cad.cursos.length ? 'Nenhuma turma cadastrada.' : 'Cadastre um curso antes de criar turmas.'}
        </p>
      )}
      <div className="lista-cartoes">
        {lista.map((t) => (
          <button key={t.id} className={`cartao-lista com-cor ${t.ativo ? '' : 'inativo'}`} style={{ '--c': t.cor } as React.CSSProperties} onClick={() => setEditar(t)}>
            <strong>{t.codigo ?? t.nome}</strong>
            <span className="cartao-lista-meta">{curso.get(t.curso_id)?.nome}</span>
            {(t.data_inicio || t.data_fim) && <span className="muted">{fmtData(t.data_inicio)} a {fmtData(t.data_fim)}</span>}
            {!t.codigo && <span className="erro pequeno">Sem código — edite para informar</span>}
            {!t.ativo && <span className="selo-item">inativa</span>}
          </button>
        ))}
      </div>
      {editar && <EditarTurma turma={editar === 'nova' ? null : editar} onClose={() => setEditar(null)} />}
    </section>
  );
}

function EditarTurma({ turma, onClose }: { turma: Turma | null; onClose: () => void }) {
  const cad = useCadastros();
  const [f, setF] = useState({
    curso_id: turma?.curso_id ?? cad.cursos.find((c) => c.ativo)?.id ?? '',
    codigo: turma?.codigo ?? '', cor: turma?.cor ?? CORES[0],
    data_inicio: turma?.data_inicio ?? '', data_fim: turma?.data_fim ?? '', ativo: turma?.ativo ?? true,
  });
  const [erro, setErro] = useState<string | null>(null);
  const curso = cad.cursos.find((c) => c.id === f.curso_id);

  async function salvar() {
    setErro(null);
    const codigo = f.codigo.trim();
    if (!f.curso_id) return setErro('Escolha o curso.');
    if (!/^\d{9}$/.test(codigo)) return setErro('Informe o código da turma (9 dígitos).');
    if (f.data_inicio && f.data_fim && f.data_fim < f.data_inicio) return setErro('O fim precisa ser depois do início.');
    const dados = {
      curso_id: f.curso_id, codigo, nome: nomeAutomatico(codigo, curso?.nome ?? ''), cor: f.cor,
      data_inicio: f.data_inicio || null, data_fim: f.data_fim || null, ativo: f.ativo,
    };
    const { error } = turma ? await supabase.from('turmas').update(dados).eq('id', turma.id) : await supabase.from('turmas').insert(dados);
    if (error) return setErro(mensagemErro(error));
    await cad.recarregar();
    onClose();
  }

  return (
    <Modal titulo={turma ? (turma.codigo ?? turma.nome) : 'Nova turma'} subtitulo={turma ? curso?.nome : undefined} onClose={onClose}
           rodape={<><span className="flex" /><button className="secundario" onClick={onClose}>Cancelar</button><button onClick={salvar}>Salvar</button></>}>
      <label className="campo">Curso
        {/* o curso de uma turma existente não muda: as aulas apontam para UCs do curso */}
        <select value={f.curso_id} disabled={!!turma} onChange={(e) => setF({ ...f, curso_id: e.target.value })}>
          <option value="" disabled>Escolha…</option>
          {cad.cursos.filter((c) => c.ativo || c.id === f.curso_id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </label>
      <label className="campo">Código da turma
        <input value={f.codigo} inputMode="numeric" maxLength={9} autoFocus={!turma}
               onChange={(e) => setF({ ...f, codigo: e.target.value.replace(/\D/g, '') })} placeholder="202600015" />
      </label>
      <div className="grade-campos">
        <label className="campo">Início<input type="date" value={f.data_inicio} onChange={(e) => setF({ ...f, data_inicio: e.target.value })} /></label>
        <label className="campo">Fim<input type="date" value={f.data_fim} onChange={(e) => setF({ ...f, data_fim: e.target.value })} /></label>
      </div>
      <div className="campo"><span>Cor</span><SeletorCor cores={CORES} valor={f.cor} onChange={(cor) => setF({ ...f, cor })} /></div>
      <label className="check"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Turma ativa</label>
      {f.codigo && curso && (
        <div className="previa">
          <span className="cartao" style={{ '--c': f.cor } as React.CSSProperties}>
            <span className="cartao-corpo"><span className="nome">{nomeAutomatico(f.codigo, curso.nome)}</span><span className="sub">Como aparece na agenda</span></span>
          </span>
        </div>
      )}
      {erro && <p className="erro">{erro}</p>}
    </Modal>
  );
}
