'use client';
import { useEffect } from 'react';

interface Props {
  titulo: string;
  subtitulo?: string;
  largo?: boolean;
  onClose: () => void;
  rodape?: React.ReactNode;
  children: React.ReactNode;
}

export default function Modal({ titulo, subtitulo, largo, onClose, rodape, children }: Props) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', f);
    return () => document.removeEventListener('keydown', f);
  }, [onClose]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={titulo} onMouseDown={onClose}>
      <div className={`dialog ${largo ? 'largo' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>{titulo}</h2>
            {subtitulo && <p className="muted">{subtitulo}</p>}
          </div>
          <button className="fechar" onClick={onClose} aria-label="Fechar">×</button>
        </header>
        {children}
        {rodape && <footer>{rodape}</footer>}
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
