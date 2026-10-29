'use client';
import { DIAS, MESES, deIso, diaSemana, diasUteisDoMes, iso } from '@/lib/datas';
import type { Usuario } from '@/lib/types';
import { ItemPainel, fmtH, horasDoDia } from './dados';
import { useDica } from './Dica';
import { Secao } from './Partes';

/** Rampa ordinal azul (degraus 250→700, validada: o mais claro ainda tem 2:1 sobre o branco); o último é a zona do limite do RH. */
const FAIXAS = [
  { ate: 4, cor: '#86b6ef', rot: 'até 4h' },
  { ate: 6, cor: '#5598e7', rot: '4–6h' },
  { ate: 8, cor: '#2a78d6', rot: '6–8h' },
  { ate: 9, cor: '#1c5cab', rot: '8–9h' },
  { ate: 99, cor: '#0d366b', rot: '9h ou mais' },
];
const corHoras = (hh: number) => FAIXAS.find((f) => hh <= f.ate)!.cor;

interface Dia { data: string; trabalho: number; aulas: number; eventos: number; ausente: string | null; conflito: boolean; itens: number }

export default function Carga({ instrutores, itens, conflitos, ano, mes }: {
  instrutores: Usuario[]; itens: ItemPainel[]; conflitos: Set<string>; ano: number; mes: number;
}) {
  const dica = useDica();
  const dias = diasUteisDoMes(ano, mes).map(iso);

  const linhas = instrutores.map((u) => {
    const meus = itens.filter((i) => i.instrutor_id === u.id);
    const porDia: Dia[] = dias.map((d) => {
      const doDia = meus.filter((i) => i.data === d);
      const trab = doDia.filter((i) => i.trabalho);
      const ausencia = doDia.find((i) => !i.trabalho);
      return {
        data: d, trabalho: horasDoDia(trab), aulas: horasDoDia(trab.filter((i) => i.tipo === 'aula')),
        eventos: horasDoDia(trab.filter((i) => i.tipo === 'evento')),
        ausente: ausencia ? ausencia.titulo ?? 'Ausência' : null,
        conflito: doDia.some((i) => conflitos.has(i.id)), itens: doDia.length,
      };
    });
    const total = porDia.reduce((s, d) => s + d.trabalho, 0);
    return {
      u, porDia, total,
      aulas: porDia.reduce((s, d) => s + d.aulas, 0), eventos: porDia.reduce((s, d) => s + d.eventos, 0),
      diasTrab: porDia.filter((d) => d.trabalho > 0).length,
      maior: Math.max(0, ...porDia.map((d) => d.trabalho)),
      cheios: porDia.filter((d) => d.trabalho >= 9).length,
      diasConflito: porDia.filter((d) => d.conflito).length,
    };
  }).sort((a, b) => b.total - a.total);
  const maxTotal = Math.max(1, ...linhas.map((l) => l.aulas + l.eventos));

  const tabela = (
    <table className="tabela">
      <thead><tr><th>Instrutor</th><th>Total</th><th>Aulas</th><th>Eventos</th><th>Dias</th><th>Maior dia</th><th>Dias ≥ 9h</th><th>Dias com conflito</th></tr></thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.u.id}>
            <td>{l.u.nome}</td><td className="num">{fmtH(l.total)}</td><td className="num">{fmtH(l.aulas)}</td><td className="num">{fmtH(l.eventos)}</td>
            <td className="num">{l.diasTrab}</td><td className="num">{fmtH(l.maior)}</td><td className="num">{l.cheios}</td><td className="num">{l.diasConflito}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Secao id="carga" titulo={`Carga dos instrutores · ${MESES[mes]} ${ano}`}
           sub="Horas de trabalho por dia (aulas + eventos de trabalho, sem contar sobreposição duas vezes). Limite do RH: 10 h por dia."
           tabela={tabela}>
      {!linhas.length ? <p className="muted vazio">Nenhum instrutor para o filtro escolhido.</p> : (
        <>
          <div className="calor-rolagem">
            <div className="calor" style={{ gridTemplateColumns: `minmax(150px, 190px) repeat(${dias.length}, minmax(22px, 1fr)) minmax(170px, 210px)` }}>
              <span className="calor-canto">Instrutor</span>
              {dias.map((d) => {
                const dw = diaSemana(deIso(d));
                return <span key={d} className={`calor-dia ${dw === 0 ? 'seg' : ''}`}><small>{DIAS[dw]?.toLowerCase()}</small>{Number(d.slice(8))}</span>;
              })}
              <span className="calor-canto">Aulas · eventos no mês</span>
              {linhas.map((l) => (
                <div key={l.u.id} className="calor-linha" style={{ display: 'contents' }}>
                  <span className="calor-nome"><span className="bolinha-inline" style={{ background: l.u.cor }} /> {l.u.nome}</span>
                  {l.porDia.map((d) => (
                    <span key={d.data}
                          className={`calor-cel ${d.conflito ? 'conflito' : ''} ${d.ausente && !d.trabalho ? 'ausente' : ''} ${diaSemana(deIso(d.data)) === 0 ? 'seg' : ''}`}
                          style={d.trabalho > 0 ? { background: corHoras(d.trabalho) } : undefined}
                          aria-label={`${l.u.nome}, ${d.data.slice(8)}/${d.data.slice(5, 7)}: ${d.trabalho ? fmtH(d.trabalho) : d.ausente ?? 'livre'}`}
                          {...dica(`${l.u.nome} · ${d.data.slice(8)}/${d.data.slice(5, 7)}`, [
                            { valor: d.trabalho ? fmtH(d.trabalho) : d.ausente ?? 'Livre', rotulo: d.trabalho ? 'de trabalho' : undefined },
                            ...(d.aulas ? [{ valor: fmtH(d.aulas), rotulo: 'em aula', cor: '#2a78d6' }] : []),
                            ...(d.eventos ? [{ valor: fmtH(d.eventos), rotulo: 'em eventos', cor: '#eb6834' }] : []),
                            ...(d.ausente && d.trabalho ? [{ valor: d.ausente, rotulo: 'também no dia' }] : []),
                            ...(d.conflito ? [{ valor: '⚠ conflito de horário', rotulo: 'neste dia' }] : []),
                          ])}>
                      {d.trabalho >= 9 ? <b>{Math.round(d.trabalho)}</b> : d.ausente && !d.trabalho ? '·' : ''}
                    </span>
                  ))}
                  <span className="calor-total">
                    <span className="barra-dupla" aria-hidden="true">
                      <span style={{ width: `${(l.aulas / maxTotal) * 100}%`, background: '#2a78d6' }} />
                      <span style={{ width: `${(l.eventos / maxTotal) * 100}%`, background: '#eb6834' }} />
                    </span>
                    <span className="calor-total-txt"><b>{fmtH(l.total)}</b> {l.cheios > 0 && <span className="aviso-dia">· {l.cheios} dia(s) ≥ 9h</span>}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="legendas-linha">
            <p className="legenda-viz">
              <span className="legenda-titulo">Horas no dia</span>
              {FAIXAS.map((f) => <span key={f.rot}><i style={{ background: f.cor }} /> {f.rot}</span>)}
              <span><i className="l-ausente" /> férias / folga</span>
              <span><i className="l-conflito" /> conflito de horário</span>
            </p>
            <p className="legenda-viz">
              <span className="legenda-titulo">Total do mês</span>
              <span><i style={{ background: '#2a78d6' }} /> aulas</span>
              <span><i style={{ background: '#eb6834' }} /> eventos de trabalho</span>
            </p>
          </div>
        </>
      )}
    </Secao>
  );
}
