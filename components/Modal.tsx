'use client';
import { useEffect, useId, useRef } from 'react';
import Icone from './Icone';

interface Props {
  titulo: string;
  subtitulo?: string;
  largo?: boolean;
  onClose: () => void;
  rodape?: React.ReactNode;
  erro?: string | null; // aparece no rodapé, junto dos botões (sempre visível, mesmo com o corpo rolado)
  children: React.ReactNode;
}

// modais abertos, do mais antigo ao mais novo: Esc e Tab valem só para o de cima
const pilha: HTMLElement[] = [];
const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Janela por cima da tela. Cabeçalho e rodapé ficam fixos; o corpo rola.
 * Com rodapé (formulário), clicar fora não fecha — para não perder o que foi preenchido. Sem rodapé (só leitura), fecha.
 */
export default function Modal({ titulo, subtitulo, largo, onClose, rodape, erro, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const fechar = useRef(onClose);
  const baixouFora = useRef(false);
  const tituloId = useId();
  useEffect(() => { fechar.current = onClose; });

  useEffect(() => {
    const el = ref.current!;
    const antes = document.activeElement as HTMLElement | null;
    pilha.push(el);
    // foco inicial: o campo com autoFocus, se houver; senão a própria janela (o leitor de tela lê o título)
    if (!el.contains(document.activeElement)) el.focus();

    const tecla = (e: KeyboardEvent) => {
      if (pilha[pilha.length - 1] !== el) return;
      if (e.key === 'Escape') { e.preventDefault(); fechar.current(); return; }
      if (e.key !== 'Tab') return;
      const focaveis = [...el.querySelectorAll<HTMLElement>(FOCAVEIS)].filter((x) => x.offsetParent !== null);
      if (!focaveis.length) { e.preventDefault(); return; }
      const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === el)) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      pilha.splice(pilha.indexOf(el), 1);
      if (antes?.isConnected) antes.focus();
    };
  }, []);

  return (
    <div className="overlay"
         onMouseDown={(e) => { baixouFora.current = e.target === e.currentTarget; }}
         onClick={(e) => { if (!rodape && baixouFora.current && e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`dialog ${largo ? 'largo' : ''}`} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1}>
        <header className="dialog-topo">
          <div>
            <h2 id={tituloId}>{titulo}</h2>
            {subtitulo && <p className="muted">{subtitulo}</p>}
          </div>
          <button type="button" className="fechar" onClick={onClose} aria-label="Fechar"><Icone nome="fechar" tamanho={20} /></button>
        </header>
        <div className="dialog-corpo">{children}</div>
        {(rodape || erro) && (
          <footer className="dialog-rodape">
            {erro && <p className="erro" role="alert">{erro}</p>}
            {rodape && <div className="dialog-acoes">{rodape}</div>}
          </footer>
        )}
      </div>
    </div>
  );
}

/** Paleta de cores com opção de cor livre (mesmo visual do cadastro da v0). */
export function SeletorCor({ cores, valor, onChange }: { cores: string[]; valor: string; onChange: (c: string) => void }) {
  const naPaleta = cores.includes(valor.toUpperCase());
  return (
    <div className="cores">
      {cores.map((c) => (
        <button key={c} type="button" className={`cor ${valor.toUpperCase() === c ? 'ativa' : ''}`}
                style={{ background: c }} onClick={() => onChange(c)} aria-label={`Cor ${c}`} aria-pressed={valor.toUpperCase() === c} />
      ))}
      <label className={`cor outra ${naPaleta ? '' : 'ativa'}`} title="Outra cor" style={naPaleta ? undefined : { background: valor }}>
        <input type="color" value={valor} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label="Escolher outra cor" />
        {naPaleta && '+'}
      </label>
    </div>
  );
}
