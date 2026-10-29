'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Local, mensagemErro } from '@/lib/types';
import { useCadastros } from './Contexto';
import Modal from './Modal';
import { BarraFiltros, Busca, Filtro, SITUACOES, confereSituacao, normal } from './Filtros';

/** Cadastro simples dos locais de aula (salas, laboratórios…). Cada um tem a própria agenda. */
export default function Locais() {
  const cad = useCadastros();
  const [editar, setEditar] = useState<Local | 'novo' | null>(null);
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('ativos');

  const q = normal(busca.trim());
  const lista = cad.locais.filter((l) => confereSituacao(situacao, l.ativo)).filter((l) => !q || normal(l.nome).includes(q));

  return (
    <section className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Locais</h1>
          <p className="muted">Salas e laboratórios onde as aulas acontecem. Cada local tem a sua agenda (Agenda → Locais).</p>
        </div>
        <span className="flex" />
        <button onClick={() => setEditar('novo')}>+ Novo local</button>
      </header>
      <BarraFiltros total={lista.length} rotulo={['local', 'locais']}>
        <Busca valor={busca} onChange={setBusca} placeholder="Buscar local" />
        <Filtro rotulo="Situação" valor={situacao} onChange={setSituacao} opcoes={SITUACOES} />
      </BarraFiltros>
      {!lista.length && <p className="muted vazio">Nenhum local com esses filtros.</p>}
      <div className="lista-cartoes">
        {lista.map((l) => (
          <button key={l.id} className={`cartao-lista ${l.ativo ? '' : 'inativo'}`} onClick={() => setEditar(l)}>
            <strong>{l.nome}</strong>
            {!l.ativo && <span className="selo-item">inativo</span>}
          </button>
        ))}
      </div>
      {editar && <EditarLocal local={editar === 'novo' ? null : editar} onClose={() => setEditar(null)} />}
    </section>
  );
}

function EditarLocal({ local, onClose }: { local: Local | null; onClose: () => void }) {
  const cad = useCadastros();
  const [f, setF] = useState({ nome: local?.nome ?? '', ordem: local?.ordem ?? 100, ativo: local?.ativo ?? true });
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setErro(null);
    if (!f.nome.trim()) return setErro('Informe o nome do local.');
    const dados = { nome: f.nome.trim(), ordem: Number(f.ordem) || 100, ativo: f.ativo };
    const { error } = local ? await supabase.from('locais').update(dados).eq('id', local.id) : await supabase.from('locais').insert(dados);
    if (error) return setErro(mensagemErro(error));
    await cad.recarregar();
    onClose();
  }

  return (
    <Modal titulo={local ? local.nome : 'Novo local'} onClose={onClose}
           rodape={<><span className="flex" /><button className="secundario" onClick={onClose}>Cancelar</button><button onClick={salvar}>Salvar</button></>}>
      <label className="campo">Nome<input value={f.nome} autoFocus onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Sala 7" /></label>
      <label className="campo">Ordem nas listas <span className="opcional">(menor aparece primeiro)</span>
        <input type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: Number(e.target.value) })} />
      </label>
      <label className="check"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Local ativo (inativo some das listas, mas continua nas aulas antigas)</label>
      {erro && <p className="erro">{erro}</p>}
    </Modal>
  );
}
