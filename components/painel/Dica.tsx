'use client';
import { createContext, useCallback, useContext, useState } from 'react';

/** Linha do tooltip: o valor vem primeiro e forte; o rótulo vem depois, discreto. */
export interface LinhaDica { valor: string; rotulo?: string; cor?: string }
interface Dica { x: number; y: number; titulo: string; linhas: LinhaDica[] }

const Ctx = createContext<{ mostrar: (alvo: Element | { x: number; y: number }, titulo: string, linhas: LinhaDica[]) => void; esconder: () => void } | null>(null);

export function ProvedorDica({ children }: { children: React.ReactNode }) {
  const [dica, setDica] = useState<Dica | null>(null);
  const mostrar = useCallback((alvo: Element | { x: number; y: number }, titulo: string, linhas: LinhaDica[]) => {
    const p = alvo instanceof Element
      ? (() => { const r = alvo.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top }; })()
      : alvo;
    setDica({ ...p, titulo, linhas });
  }, []);
  const esconder = useCallback(() => setDica(null), []);
  return (
    <Ctx.Provider value={{ mostrar, esconder }}>
      {children}
      {dica && (
        <div className="dica-painel" role="tooltip" style={{ left: dica.x, top: dica.y }}>
          <span className="dica-titulo">{dica.titulo}</span>
          {dica.linhas.map((l, i) => (
            <span key={i} className="dica-linha">
              {l.cor && <i style={{ background: l.cor }} aria-hidden="true" />}
              <strong>{l.valor}</strong>{l.rotulo && <span>{l.rotulo}</span>}
            </span>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}

/**
 * Props para uma marca com tooltip: hover (segue o ponteiro) e foco de teclado (mesmo conteúdo).
 * O tooltip complementa — todo valor também aparece em texto ou na tabela.
 */
export function useDica() {
  const c = useContext(Ctx);
  return (titulo: string, linhas: LinhaDica[]) => ({
    tabIndex: 0,
    onPointerMove: (e: React.PointerEvent) => c?.mostrar({ x: e.clientX, y: e.clientY - 8 }, titulo, linhas),
    onPointerLeave: () => c?.esconder(),
    onFocus: (e: React.FocusEvent) => c?.mostrar(e.currentTarget, titulo, linhas),
    onBlur: () => c?.esconder(),
  });
}
