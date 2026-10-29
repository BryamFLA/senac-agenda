'use client';
import { Item, fmtMin, minutos } from '@/lib/types';
import { ddmm, deIso, hhmm, nomeDia } from '@/lib/datas';
import { useCadastros } from './Contexto';
import Modal from './Modal';
import { ElementosUC } from './Cursos';
import { LocalDoItem } from './ReservarLocal';

/** Visão do instrutor ao clicar numa aula ou evento: dados da aula e os elementos da UC (para o PTD). */
export default function DetalheAula({ item, alerta, onClose, onAlterou }: {
  item: Item; alerta?: string; onClose: () => void; onAlterou: () => void;
}) {
  const cad = useCadastros();
  const d = deIso(item.data);
  const turma = cad.turmas.find((t) => t.id === item.turma_id);
  const uc = cad.ucs.find((u) => u.id === item.uc_id);
  const instrutor = cad.usuarios.find((u) => u.id === item.instrutor_id);
  const integradas = uc?.tipo === 'projeto_integrador'
    ? cad.ucs.filter((u) => u.curso_id === uc.curso_id && uc.integra.includes(u.numero)) : [];

  return (
    <Modal largo titulo={item.tipo === 'aula' ? `${turma?.nome ?? 'Aula'}` : item.titulo ?? 'Evento'}
           subtitulo={`${nomeDia(d)}, ${ddmm(d)} · ${hhmm(item.hora_inicio)}–${hhmm(item.hora_fim)} (${fmtMin(minutos(item.hora_inicio, item.hora_fim))}) · ${instrutor?.nome ?? ''}`}
           onClose={onClose}>
      {alerta && <div className="alerta conflito"><strong>⚠ Conflito de horário</strong><span>{alerta}</span></div>}
      <LocalDoItem item={item} onAlterou={onAlterou} />
      {item.observacao && <p className="nota">{item.observacao}</p>}
      {uc && (
        <div className="form">
          <h3 className="titulo-uc">UC{uc.numero} — {uc.nome} <span className="muted">({fmtMin(Number(uc.ch) * 60)})</span></h3>
          <ElementosUC uc={uc} />
          {integradas.length > 0 && (
            <p className="muted">Projeto Integrador: usa os elementos das UCs {integradas.map((u) => `UC${u.numero}`).join(', ')}.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
