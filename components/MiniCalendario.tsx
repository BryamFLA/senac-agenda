'use client';
import { DIAS, MESES, ddmm, diaSemana, diasUteisDoMes, iso, nomeDia } from '@/lib/datas';
import Icone from './Icone';
import type { Situacao } from './ListaEscolha';

interface Props {
  ano: number;
  mes: number; // primeiro dos dois meses mostrados
  onNavegar: (delta: number) => void;
  selecionadas: Set<string>;
  motivos: Map<string, Situacao> | null; // null = verificando
  onAlternar: (data: string) => void;
  onDiaSemana: (dow: number, datas: string[]) => void;
}

/** Dois meses lado a lado (SEG–SÁB). Cada data: livre, com conflito de horário (aviso) ou bloqueada (RH). */
export default function MiniCalendario({ ano, mes, onNavegar, selecionadas, motivos, onAlternar, onDiaSemana }: Props) {
  const hoje = iso(new Date());
  const meses = [0, 1].map((k) => {
    const d = new Date(ano, mes + k, 1);
    return { ano: d.getFullYear(), mes: d.getMonth(), dias: diasUteisDoMes(d.getFullYear(), d.getMonth()) };
  });

  return (
    <div className="minical">
      <div className="minical-nav">
        <button type="button" className="icone pequeno" onClick={() => onNavegar(-1)} aria-label="Meses anteriores"><Icone nome="voltar" tamanho={18} /></button>
        <span className="muted" aria-live="polite">{motivos ? 'Clique nas datas para repetir no mesmo horário' : 'Verificando disponibilidade…'}</span>
        <button type="button" className="icone pequeno" onClick={() => onNavegar(1)} aria-label="Próximos meses"><Icone nome="avancar" tamanho={18} /></button>
      </div>
      <div className="minical-meses">
        {meses.map((m) => {
          const vazios = diaSemana(m.dias[0]);
          return (
            <div key={`${m.ano}-${m.mes}`} className="minical-mes">
              <strong>{MESES[m.mes]} {m.ano}</strong>
              <div className="minical-grade">
                {DIAS.map((d, dow) => (
                  <button key={d} type="button" className="minical-dow" title={`Marcar ou desmarcar todas as ${d} livres deste mês`}
                          aria-label={`Marcar ou desmarcar todas as ${d} livres de ${MESES[m.mes]}`}
                          onClick={() => onDiaSemana(dow, m.dias.filter((x) => diaSemana(x) === dow).map(iso))}>
                    {d.slice(0, 3)}
                  </button>
                ))}
                {Array.from({ length: vazios }, (_, i) => <span key={`v${i}`} />)}
                {m.dias.map((d) => {
                  const k = iso(d);
                  const s = motivos?.get(k);
                  const bloqueada = !!s?.motivo;
                  const conflito = !bloqueada && !!s?.conflito;
                  const motivo = s?.motivo ?? s?.conflito ?? null;
                  const sel = selecionadas.has(k);
                  return (
                    <button key={k} type="button" onClick={() => onAlternar(k)}
                            className={`minical-dia ${sel ? 'sel' : ''} ${bloqueada ? 'bloq' : conflito ? 'conflito' : motivos ? 'livre' : ''} ${k === hoje ? 'hoje' : ''} ${k < hoje ? 'passado' : ''}`}
                            title={motivo ?? (motivos ? 'Livre' : '')} aria-pressed={sel}
                            aria-label={`${nomeDia(d)}, ${ddmm(d)}${motivo ? `: ${motivo}` : motivos ? ': livre' : ''}`}>
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="minical-legenda">
        <span><i className="livre" /> livre</span>
        <span><i className="conflito" /> conflito de horário (pode lançar, com aviso)</span>
        <span><i className="bloq" /> bloqueada pelo RH</span>
        <span><i className="sel" /> selecionada</span>
        <span className="pequeno">Passe o mouse na data para ver o motivo.</span>
      </div>
    </div>
  );
}
