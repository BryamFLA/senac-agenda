'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ITEM_CAMPOS, Item, TURNOS, Turno, mensagemErro, sobrepoe } from '@/lib/types';
import { ddmm, hhmm, iso, nomeDia } from '@/lib/datas';
import { indices, useCadastros } from './Contexto';
import Modal from './Modal';
import Icone from './Icone';
import { avisar } from './Avisos';

/**
 * Instrutor na agenda de um local: escolhe uma aula (ou evento) dele nesse turno e reserva o local para ela.
 * O banco recusa se outra pessoa já estiver no local nesse horário (definir_local).
 */
export default function ReservarLocal({ localId, data, turno, ocupados, onClose, onSalvo }: {
  localId: string; data: Date; turno: Turno; ocupados: Item[]; onClose: () => void; onSalvo: () => void;
}) {
  const cad = useCadastros();
  const idx = indices(cad);
  const local = idx.local.get(localId);
  const t = TURNOS.find((x) => x.id === turno)!;
  const [meus, setMeus] = useState<Item[] | null>(null);
  const [escolhido, setEscolhido] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    supabase.from('itens').select(ITEM_CAMPOS).eq('instrutor_id', cad.eu.id).eq('data', iso(data)).eq('turno', turno).order('hora_inicio')
      .then(({ data: r }) => {
        const lista = (r ?? []) as Item[];
        setMeus(lista);
        const livre = lista.find((i) => i.local_id !== localId && !ocupados.some((o) => o.instrutor_id !== cad.eu.id && sobrepoe(o, i)));
        if (livre) setEscolhido(livre.id);
      });
  }, [cad.eu.id, data, turno, localId, ocupados]);

  const ocupadoPor = (i: Item) => ocupados.find((o) => o.instrutor_id !== cad.eu.id && sobrepoe(o, i));
  const nomeItem = (i: Item) => (i.tipo === 'aula' ? idx.turma.get(i.turma_id ?? '')?.nome ?? 'Aula' : i.titulo ?? 'Evento');

  async function reservar() {
    if (!escolhido) return;
    setErro(null); setSalvando(true);
    const { error } = await supabase.rpc('definir_local', { p_item: escolhido, p_local: localId, p_outro: null });
    setSalvando(false);
    if (error) return setErro(mensagemErro(error, 'Não foi possível reservar o local.'));
    avisar(`${local?.nome ?? 'Local'} reservado.`);
    onSalvo();
  }

  return (
    <Modal titulo={`Reservar ${local?.nome ?? 'local'}`}
           subtitulo={`${nomeDia(data)}, ${ddmm(data)} · ${t.nome}`} onClose={onClose} erro={erro}
           rodape={<><span className="flex" /><button className="secundario" onClick={onClose}>Cancelar</button>
             {!!meus?.length && <button onClick={reservar} disabled={!escolhido || salvando}>{salvando ? 'Reservando…' : 'Reservar'}</button>}</>}>
      {!meus ? <p className="muted">Carregando…</p> : !meus.length ? (
        <p className="muted vazio">Você não tem aula nem evento neste turno. A reserva de local é feita para um item seu que já está na agenda — peça à coordenação para lançar a aula.</p>
      ) : (
        <div className="campo">
          <span>Para qual item seu?</span>
          <ul className="escolha" role="listbox" aria-label="Seus itens neste turno">
            {meus.map((i) => {
              const ja = i.local_id === localId;
              const outro = ocupadoPor(i);
              const atual = i.local_id ? idx.local.get(i.local_id)?.nome : i.local_outro;
              return (
                <li key={i.id} role="none">
                  <button type="button" role="option" aria-selected={escolhido === i.id} disabled={ja || !!outro}
                          className={`escolha-item ${escolhido === i.id ? 'sel' : ''} ${outro ? 'bloq' : ''}`} onClick={() => setEscolhido(i.id)}>
                    <span className="escolha-texto">
                      <span className="escolha-nome">{nomeItem(i)} <small>· {hhmm(i.hora_inicio)}–{hhmm(i.hora_fim)}</small></span>
                      <small className={outro ? 'escolha-motivo' : 'muted'}>
                        {ja ? 'Já está neste local'
                          : outro ? `Local ocupado por ${idx.usuario.get(outro.instrutor_id)?.nome ?? 'outra pessoa'} (${hhmm(outro.hora_inicio)}–${hhmm(outro.hora_fim)})`
                          : atual ? `Hoje em: ${atual} (troca para ${local?.nome})` : 'Sem local'}
                      </small>
                    </span>
                    {escolhido === i.id && <span className="escolha-check"><Icone nome="check" tamanho={16} /></span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
}

/** Local de um item na visão do instrutor: mostra e, se o item for dele, deixa trocar (definir_local). */
export function LocalDoItem({ item, onAlterou }: { item: Item; onAlterou: () => void }) {
  const cad = useCadastros();
  const meu = item.instrutor_id === cad.eu.id;
  const nomeAtual = item.local_id ? cad.locais.find((l) => l.id === item.local_id)?.nome : item.local_outro;
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(item.local_outro ? '__outro' : item.local_id ?? '');
  const [outro, setOutro] = useState(item.local_outro ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    if (valor === '__outro' && !outro.trim()) return setErro('Digite o local.');
    setSalvando(true);
    const { error } = await supabase.rpc('definir_local', {
      p_item: item.id, p_local: valor && valor !== '__outro' ? valor : null, p_outro: valor === '__outro' ? outro.trim() : null,
    });
    setSalvando(false);
    if (error) return setErro(mensagemErro(error, 'Não foi possível mudar o local.'));
    avisar('Local da aula salvo.');
    onAlterou();
  }

  if (!editando) {
    return (
      <p className="local-linha">
        <strong>Local:</strong> {nomeAtual ?? <span className="muted">não definido</span>}
        {meu && <button type="button" className="link" onClick={() => setEditando(true)}>{nomeAtual ? 'Trocar' : 'Definir local'}</button>}
      </p>
    );
  }
  return (
    <div className="novo">
      <label className="campo">Local da aula
        <select value={valor} onChange={(e) => setValor(e.target.value)}>
          <option value="">Sem local</option>
          {cad.locais.filter((l) => l.ativo || l.id === item.local_id).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          <option value="__outro">Outro local (digitar)</option>
        </select>
      </label>
      {valor === '__outro' && (
        <label className="campo">Qual local?<input value={outro} autoFocus onChange={(e) => setOutro(e.target.value)} placeholder="Ex.: Empresa parceira, visita técnica" /></label>
      )}
      <p className="muted pequeno">Só dá para reservar um local que esteja vazio nesse horário. Se estiver ocupado, fale com a coordenação.</p>
      {erro && <p className="erro" role="alert">{erro}</p>}
      <div className="flex-linha">
        <span className="flex" />
        <button type="button" className="secundario" onClick={() => setEditando(false)}>Cancelar</button>
        <button type="button" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar local'}</button>
      </div>
    </div>
  );
}
