'use client';
import { MESES, ddmm, deIso, iso } from '@/lib/datas';
import { ResumoTurma, fmtH, pct } from './dados';
import { useDica } from './Dica';
import { Secao, Selo } from './Partes';

const dia = (s: string) => Math.round(deIso(s).getTime() / 86400000);
const dt = (s: string | null) => (s ? `${ddmm(deIso(s))}/${s.slice(2, 4)}` : '—');

/** Linha do tempo (início → última aula agendada) + previsão de fechamento de cada turma. */
export default function Fechamento({ resumos }: { resumos: ResumoTurma[] }) {
  const dica = useDica();
  const hoje = iso(new Date());
  const comDatas = resumos
    .map((r) => ({ r, ini: r.primeira ?? r.turma.data_inicio, fim: r.ultima ?? r.turma.data_fim }))
    .filter((x): x is { r: ResumoTurma; ini: string; fim: string } => !!x.ini && !!x.fim)
    .sort((a, b) => a.fim.localeCompare(b.fim));

  const limites = comDatas.flatMap((x) => [x.ini, x.fim, x.r.turma.data_fim ?? x.fim]).concat(hoje).sort();
  const d0 = limites.length ? dia(limites[0]) : 0;
  const d1 = limites.length ? dia(limites[limites.length - 1]) : 1;
  const span = Math.max(d1 - d0, 1);
  const x = (s: string) => ((dia(s) - d0) / span) * 100;

  // marcas de mês no eixo (no máximo ~14, pulando meses se o período for longo)
  const meses: { pos: number; rot: string }[] = [];
  if (limites.length) {
    const a = deIso(limites[0]); const b = deIso(limites[limites.length - 1]);
    const total = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1;
    const passo = Math.max(1, Math.ceil(total / 14));
    for (let k = 1; k <= total; k += passo) {
      const m = new Date(a.getFullYear(), a.getMonth() + k, 1);
      if (iso(m) > limites[limites.length - 1]) break;
      meses.push({ pos: x(iso(m)), rot: `${MESES[m.getMonth()].slice(0, 3)}${m.getMonth() === 0 ? ` ${m.getFullYear()}` : ''}` });
    }
  }

  const diferenca = (r: ResumoTurma) => {
    if (!r.turma.data_fim || !r.ultima || r.aLancar > 0) return null;
    return dia(r.ultima) - dia(r.turma.data_fim);
  };

  return (
    <Secao id="fechamento" titulo="Fechamento das turmas"
           sub="Do início à última aula agendada. A previsão só é firme quando toda a carga horária está lançada.">
      {!comDatas.length ? <p className="muted vazio">Nenhuma turma com aulas ou datas cadastradas para o filtro escolhido.</p> : (
        <div className="gantt">
          <div className="gantt-eixo">
            <span className="gantt-rotulo" />
            <div className="gantt-trilha">
              {meses.map((m, i) => <span key={i} className="gantt-mes" style={{ left: `${m.pos}%` }}>{m.rot}</span>)}
            </div>
          </div>
          {comDatas.map(({ r, ini, fim }) => {
            const corte = hoje < ini ? ini : hoje > fim ? fim : hoje;
            return (
              <div key={r.turma.id} className="gantt-linha">
                <span className="gantt-rotulo">
                  <strong>{r.turma.codigo ?? r.turma.nome}</strong>
                  <small>{r.curso?.nome}</small>
                </span>
                <div className="gantt-trilha">
                  {meses.map((m, i) => <span key={i} className="gantt-grade" style={{ left: `${m.pos}%` }} />)}
                  <span className="gantt-hoje" style={{ left: `${x(hoje)}%` }} />
                  <span className="gantt-barra" style={{ left: `${x(ini)}%`, width: `${Math.max(x(fim) - x(ini), 0.6)}%`, '--c': r.turma.cor } as React.CSSProperties}
                        {...dica(r.turma.codigo ?? r.turma.nome, [
                          { valor: `${dt(ini)} → ${dt(fim)}`, rotulo: r.ultima ? 'primeira → última aula' : 'datas cadastradas' },
                          { valor: `${pct(r.realizado, r.ch)}%`, rotulo: 'concluído' },
                          ...(r.aLancar > 0 ? [{ valor: fmtH(r.aLancar), rotulo: 'ainda a lançar' }] : []),
                          ...(r.turma.data_fim ? [{ valor: dt(r.turma.data_fim), rotulo: 'fim cadastrado' }] : []),
                        ])}>
                    <span className="gantt-feito" style={{ width: `${((dia(corte) - dia(ini)) / Math.max(dia(fim) - dia(ini), 1)) * 100}%` }} />
                  </span>
                  {r.turma.data_fim && <span className="gantt-fim" style={{ left: `${x(r.turma.data_fim)}%` }} title={`Fim cadastrado: ${dt(r.turma.data_fim)}`} />}
                  {r.aLancar > 0 && <span className="gantt-falta" style={{ left: `calc(${x(fim)}% + 6px)` }}>+{fmtH(r.aLancar)} a lançar</span>}
                </div>
              </div>
            );
          })}
          <p className="legenda-viz">
            <span><i className="l-real" /> já realizado</span>
            <span><i className="l-agend" /> agendado</span>
            <span><i className="l-hoje" /> hoje</span>
            <span><i className="l-fim" /> fim cadastrado da turma</span>
          </p>
        </div>
      )}

      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr><th>Turma</th><th>Curso</th><th>Início</th><th>Última aula</th><th>Fim cadastrado</th><th>Diferença</th>
              <th>Concluído</th><th>Falta lançar</th><th>Situação</th></tr>
          </thead>
          <tbody>
            {resumos.slice().sort((a, b) => (a.ultima ?? '9').localeCompare(b.ultima ?? '9')).map((r) => {
              const d = diferenca(r);
              return (
                <tr key={r.turma.id}>
                  <td><strong>{r.turma.codigo ?? r.turma.nome}</strong></td>
                  <td>{r.curso?.nome}</td>
                  <td className="nowrap">{dt(r.primeira ?? r.turma.data_inicio)}</td>
                  <td className="nowrap">{dt(r.ultima)}</td>
                  <td className="nowrap">{dt(r.turma.data_fim)}</td>
                  <td className="nowrap num">
                    {d === null ? <span className="muted">—</span>
                      : d > 0 ? <Selo status="critico">{d} dias depois</Selo>
                      : d < 0 ? <span className="muted">{-d} dias antes</span> : 'no dia'}
                  </td>
                  <td className="num">{pct(r.realizado, r.ch)}%</td>
                  <td className="num">{r.aLancar > 0 ? fmtH(r.aLancar) : '—'}</td>
                  <td><Selo status={r.situacao.status}>{r.situacao.texto}</Selo></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Secao>
  );
}
