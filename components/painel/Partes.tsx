'use client';
import { useState } from 'react';
import { STATUS, Status, fmtH, pct } from './dados';
import { useDica } from './Dica';

/** Card de seção. `tabela` liga o botão "Ver tabela" (gêmeo acessível do gráfico). */
export function Secao({ id, titulo, sub, destaque, acoes, children, tabela }: {
  id: string; titulo: React.ReactNode; sub?: React.ReactNode; destaque?: 'alerta' | 'ok';
  acoes?: React.ReactNode; children: React.ReactNode; tabela?: React.ReactNode;
}) {
  const [verTabela, setVerTabela] = useState(false);
  return (
    <section id={id} className={`secao-painel ${destaque ? `destaque-${destaque}` : ''}`} aria-labelledby={`${id}-titulo`}>
      <header className="secao-painel-topo">
        <div>
          <h2 id={`${id}-titulo`}>{titulo}</h2>
          {sub && <p className="muted">{sub}</p>}
        </div>
        <div className="secao-painel-acoes">
          {acoes}
          {tabela && (
            <button type="button" className="secundario pequeno-btn" onClick={() => setVerTabela((v) => !v)} aria-pressed={verTabela}>
              {verTabela ? 'Ver gráfico' : 'Ver tabela'}
            </button>
          )}
        </div>
      </header>
      {verTabela && tabela ? <div className="tabela-rolagem">{tabela}</div> : children}
    </section>
  );
}

/** Selo de estado: cor de status + ícone + texto (a cor nunca carrega o significado sozinha). */
export function Selo({ status, children }: { status: Status; children: React.ReactNode }) {
  return (
    <span className="selo-status" style={{ '--s': STATUS[status].cor } as React.CSSProperties}>
      <span className="selo-status-icone" aria-hidden="true">{STATUS[status].icone}</span>{children}
    </span>
  );
}

/**
 * Rola até uma seção do painel sem mexer no endereço: o #hash da URL escolhe a página (#painel),
 * e trocar por #conflitos faria o recarregar cair na Agenda.
 */
export function irPara(e: React.MouseEvent, id: string) {
  e.preventDefault();
  const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
}

/** Indicador (stat tile): rótulo, valor grande, complemento. */
export function Kpi({ rotulo, valor, complemento, status, secao }: {
  rotulo: string; valor: React.ReactNode; complemento?: React.ReactNode; status?: Status; secao?: string; // secao: id da seção para onde o clique leva
}) {
  const conteudo = (
    <>
      <span className="kpi-rotulo">{status && <span className="kpi-ponto" style={{ background: STATUS[status].cor }} aria-hidden="true" />}{rotulo}</span>
      <span className="kpi-valor">{valor}</span>
      {complemento && <span className="kpi-comp">{complemento}</span>}
    </>
  );
  return secao
    ? <a className={`kpi ${status === 'critico' ? 'kpi-critico' : ''}`} href={`#${secao}`} onClick={(e) => irPara(e, secao)}>{conteudo}</a>
    : <div className={`kpi ${status === 'critico' ? 'kpi-critico' : ''}`}>{conteudo}</div>;
}

/**
 * Medidor de carga horária: realizado (azul cheio) + agendado à frente (azul claro) sobre o total (trilho).
 * Passar da CH aparece como marca vermelha no limite.
 */
export function Medidor({ realizado, agendado, total, titulo, alto }: {
  realizado: number; agendado: number; total: number; titulo: string; alto?: boolean;
}) {
  const dica = useDica();
  const max = Math.max(total, agendado, 0.0001);
  const futuro = Math.max(agendado - realizado, 0);
  return (
    <div className={`medidor ${alto ? 'alto' : ''}`} role="img"
         aria-label={`${titulo}: realizado ${fmtH(realizado)}, agendado ${fmtH(agendado)} de ${fmtH(total)}`}
         {...dica(titulo, [
           { valor: `${fmtH(realizado)} (${pct(realizado, total)}%)`, rotulo: 'realizado', cor: 'var(--viz-real)' },
           { valor: `${fmtH(agendado)} (${pct(agendado, total)}%)`, rotulo: 'agendado no total', cor: 'var(--viz-agend)' },
           { valor: fmtH(Math.max(total - agendado, 0)), rotulo: 'falta lançar', cor: 'var(--viz-trilho)' },
           { valor: fmtH(total), rotulo: 'carga horária' },
         ])}>
      <span className="m-real" style={{ width: `${(realizado / max) * 100}%` }} />
      <span className="m-agend" style={{ width: `${(futuro / max) * 100}%` }} />
      {agendado > total + 0.01 && <span className="m-limite" style={{ left: `${(total / max) * 100}%` }} />}
    </div>
  );
}

export function LegendaCarga() {
  return (
    <p className="legenda-viz">
      <span><i className="l-real" /> realizado</span>
      <span><i className="l-agend" /> agendado</span>
      <span><i className="l-trilho" /> falta lançar</span>
      <span><i className="l-limite" /> passou da CH</span>
    </p>
  );
}
