'use client';
import { DIAS, MESES, diaSemana, diasUteisDoMes, iso } from '@/lib/datas';

interface Props {
  ano: number;
  mes: number; // primeiro dos dois meses mostrados
  onNavegar: (delta: number) => void;
  selecionadas: Set<string>;
  motivos: Map<string, string | null> | null; // null = verificando
  onAlternar: (data: string) => void;
  onDiaSemana: (dow: number, datas: string[]) => void;
}

/** Dois meses lado a lado (SEG–SÁB). Cada data mostra se está livre ou bloqueada (motivo no título). */
export default function MiniCalendario({ ano, mes, onNavegar, selecionadas, motivos, onAlternar, onDiaSemana }: Props) {
  const hoje = iso(new Date());
  const meses = [0, 1].map((k) => {
    const d = new Date(ano, mes + k, 1);
    return { ano: d.getFullYear(), mes: d.getMonth(), dias: diasUteisDoMes(d.getFullYear(), d.getMonth()) };
  });

  return (
    <div className="minical">
      <div className="minical-nav">
        <button type="button" className="icone pequeno" onClick={() => onNavegar(-1)} aria-label="Meses anteriores">‹</button>
        <span className="muted">{motivos ? 'Clique nas datas para repetir no mesmo horário' : 'Verificando disponibilidade…'}</span>
        <button type="button" className="icone pequeno" onClick={() => onNavegar(1)} aria-label="Próximos meses">›</button>
      </div>
      <div className="minical-meses">
        {meses.map((m) => {
          const vazios = diaSemana(m.dias[0]);
          return (
            <div key={`${m.ano}-${m.mes}`} className="minical-mes">
              <strong>{MESES[m.mes]} {m.ano}</strong>
              <div className="minical-grade">
                {DIAS.map((d, dow) => (
                  <button key={d} type="button" className="minical-dow" title={`Alternar todas as ${d} livres deste mês`}
                          onClick={() => onDiaSemana(dow, m.dias.filter((x) => diaSemana(x) === dow).map(iso))}>
                    {d.slice(0, 3)}
                  </button>
                ))}
                {Array.from({ length: vazios }, (_, i) => <span key={`v${i}`} />)}
                {m.dias.map((d) => {
                  const k = iso(d);
                  const motivo = motivos?.get(k);
                  const bloqueada = !!motivo;
                  const sel = selecionadas.has(k);
                  return (
                    <button key={k} type="button" onClick={() => onAlternar(k)}
                            className={`minical-dia ${sel ? 'sel' : ''} ${bloqueada ? 'bloq' : motivos ? 'livre' : ''} ${k === hoje ? 'hoje' : ''} ${k < hoje ? 'passado' : ''}`}
                            title={motivo ?? (motivos ? 'Livre' : '')} aria-pressed={sel}
                            aria-label={`${k}${bloqueada ? `: ${motivo}` : ''}`}>
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
        <span><i className="bloq" /> bloqueada (passe o mouse para ver o motivo)</span>
        <span><i className="sel" /> selecionada</span>
      </div>
    </div>
  );
}
