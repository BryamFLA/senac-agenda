'use client';
import { useEffect, useState } from 'react';
import Modal from './Modal';
import Icone from './Icone';

interface Aviso { id: number; texto: string; tipo: 'ok' | 'erro' }
interface Pedido { titulo: string; texto: string; acao: string; perigo?: boolean; responder: (ok: boolean) => void }

let mostrar: ((texto: string, tipo: Aviso['tipo']) => void) | null = null;
let perguntar: ((p: Pedido) => void) | null = null;
let proximoId = 0;

/** Mensagem curta no canto da tela, que some sozinha: confirma que algo foi gravado. */
export function avisar(texto: string, tipo: Aviso['tipo'] = 'ok') {
  mostrar?.(texto, tipo);
}

/** Pergunta de confirmação no visual do sistema (no lugar do confirm() do navegador). */
export function confirmar(p: Omit<Pedido, 'responder'>): Promise<boolean> {
  return new Promise((responder) => {
    if (perguntar) perguntar({ ...p, responder });
    else responder(window.confirm(`${p.titulo}\n\n${p.texto}`));
  });
}

/** Fica uma vez na página (app/page.tsx). */
export default function Avisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [pedido, setPedido] = useState<Pedido | null>(null);

  useEffect(() => {
    mostrar = (texto, tipo) => {
      const id = ++proximoId;
      setAvisos((l) => [...l.slice(-2), { id, texto, tipo }]);
      setTimeout(() => setAvisos((l) => l.filter((x) => x.id !== id)), 4500);
    };
    perguntar = setPedido;
    return () => { mostrar = null; perguntar = null; };
  }, []);

  const responder = (ok: boolean) => { pedido?.responder(ok); setPedido(null); };

  return (
    <>
      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso-toast ${a.tipo}`}>
            <Icone nome={a.tipo === 'ok' ? 'check' : 'alerta'} tamanho={18} />
            <span>{a.texto}</span>
          </div>
        ))}
      </div>
      {pedido && (
        <Modal titulo={pedido.titulo} onClose={() => responder(false)}
               rodape={<>
                 <span className="flex" />
                 {/* em ação destrutiva o foco começa no Cancelar: Enter sem querer não apaga nada */}
                 <button type="button" className="secundario" onClick={() => responder(false)} autoFocus={pedido.perigo}>Cancelar</button>
                 <button type="button" className={pedido.perigo ? 'perigo-cheio' : ''} onClick={() => responder(true)} autoFocus={!pedido.perigo}>
                   {pedido.acao}
                 </button>
               </>}>
          <p className="confirmar-texto">{pedido.texto}</p>
        </Modal>
      )}
    </>
  );
}
