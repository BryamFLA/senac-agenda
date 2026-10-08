'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CORES, Turma, mensagemErro } from '@/lib/types';
import { ddmm, deIso } from '@/lib/datas';
import { useCadastros } from './Contexto';
import Modal, { SeletorCor } from './Modal';

export default function Turmas() {
  const cad = useCadastros();
  const [editar, setEditar] = useState<Turma | 'nova' | null>(null);
  const [inativas, setInativas] = useState(false);
  const curso = new Map(cad.cursos.map((c) => [c.id, c]));
  const lista = cad.turmas.filter((t) => inativas || t.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  return (
    <section className="pagina">
      <header className="pagina-topo">
        <div>
          <h2>Turmas</h2>
          <p className="muted">Cada turma faz o curso completo; a cor pinta as aulas na agenda do instrutor.</p>
        </div>
        <span className="flex" />
        <button onClick={() => setEditar('nova')} disabled={!cad.cursos.length}
                title={cad.cursos.length ? '' : 'Cadastre um curso primeiro'}>+ Nova turma</button>
      </header>
      <label className="check"><input type="checkbox" checked={inativas} onChange={(e) => setInativas(e.target.checked)} /> Mostrar inativas</label>
      {!lista.length && <p className="muted vazio">{cad.cursos.length ? 'Nenhuma turma cadastrada.' : 'Cadastre um curso antes de criar turmas.'}</p>}
      <div className="lista-cartoes">
        {lista.map((t) => (
          <button key={t.id} className={`cartao-lista com-cor ${t.ativo ? '' : 'inativo'}`} style={{ '--c': t.cor } as React.CSSProperties} onClick={() => setEditar(t)}>
            <strong>{t.nome}</strong>
            <span className="muted">{curso.get(t.curso_id)?.nome}{t.codigo ? ` · ${t.codigo}` : ''}</span>
            {(t.data_inicio || t.data_fim) && (
              <span className="muted">{t.data_inicio ? ddmm(deIso(t.data_inicio)) + '/' + t.data_inicio.slice(0, 4) : '…'} a {t.data_fim ? ddmm(deIso(t.data_fim)) + '/' + t.data_fim.slice(0, 4) : '…'}</span>
            )}
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
    codigo: turma?.codigo ?? '', nome: turma?.nome ?? '', cor: turma?.cor ?? CORES[0],
    data_inicio: turma?.data_inicio ?? '', data_fim: turma?.data_fim ?? '', ativo: turma?.ativo ?? true,
  });
  const [erro, setErro] = useState<string | null>(null);
  const temAulas = !!turma; // o curso de uma turma existente não muda (as aulas apontam para UCs do curso)

  async function salvar() {
    setErro(null);
    if (!f.curso_id || !f.nome.trim()) return setErro('Informe curso e nome da turma.');
    if (f.codigo && !/^\d{9}$/.test(f.codigo.trim())) return setErro('O código da turma tem 9 dígitos.');
    const dados = {
      curso_id: f.curso_id, codigo: f.codigo.trim() || null, nome: f.nome.trim(), cor: f.cor,
      data_inicio: f.data_inicio || null, data_fim: f.data_fim || null, ativo: f.ativo,
    };
    const { error } = turma ? await supabase.from('turmas').update(dados).eq('id', turma.id) : await supabase.from('turmas').insert(dados);
    if (error) return setErro(mensagemErro(error));
    await cad.recarregar();
    onClose();
  }

  return (
    <Modal titulo={turma ? turma.nome : 'Nova turma'} onClose={onClose}
           rodape={<><span className="flex" /><button className="secundario" onClick={onClose}>Cancelar</button><button onClick={salvar}>Salvar</button></>}>
      <label className="campo">Curso
        <select value={f.curso_id} disabled={temAulas} onChange={(e) => setF({ ...f, curso_id: e.target.value })}>
          <option value="" disabled>Escolha…</option>
          {cad.cursos.filter((c) => c.ativo || c.id === f.curso_id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </label>
      <label className="campo">Nome<input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Técnico Inf. Internet 2026" /></label>
      <label className="campo"><span>Código da turma <span className="opcional">(9 dígitos, opcional)</span></span>
        <input value={f.codigo} inputMode="numeric" onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="202600015" />
      </label>
      <div className="grade-campos">
        <label className="campo">Início<input type="date" value={f.data_inicio} onChange={(e) => setF({ ...f, data_inicio: e.target.value })} /></label>
        <label className="campo">Fim<input type="date" value={f.data_fim} onChange={(e) => setF({ ...f, data_fim: e.target.value })} /></label>
      </div>
      <div className="campo"><span>Cor</span><SeletorCor cores={CORES} valor={f.cor} onChange={(cor) => setF({ ...f, cor })} /></div>
      <label className="check"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Turma ativa</label>
      {erro && <p className="erro">{erro}</p>}
    </Modal>
  );
}
