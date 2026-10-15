'use client';
import type { Turma, Usuario } from '@/lib/types';
import { LinhaAndamento, fmtH } from './dados';
import { useDica } from './Dica';
import { Secao } from './Partes';

/** Rampa sequencial azul (5 degraus) para horas agendadas por instrutor × turma. */
const RAMPA = ['#86b6ef', '#5598e7', '#256abf', '#184f95', '#0d366b']; // degraus 250→700, validados (ordinal)

export default function Matriz({ linhas, instrutores, turmas }: { linhas: LinhaAndamento[]; instrutores: Usuario[]; turmas: Turma[] }) {
  const dica = useDica();
  const horas = new Map<string, { ag: number; re: number; ucs: number }>();
  for (const l of linhas) {
    const k = `${l.instrutor_id}|${l.turma_id}`;
    const v = horas.get(k) ?? { ag: 0, re: 0, ucs: 0 };
    horas.set(k, { ag: v.ag + Number(l.horas_agendadas), re: v.re + Number(l.horas_realizadas), ucs: v.ucs + 1 });
  }
  const linhasInst = instrutores.filter((u) => turmas.some((t) => horas.has(`${u.id}|${t.id}`)));
  const colunas = turmas.filter((t) => linhasInst.some((u) => horas.has(`${u.id}|${t.id}`)));
  const max = Math.max(1, ...[...horas.values()].map((v) => v.ag));
  const cor = (x: number) => RAMPA[Math.min(RAMPA.length - 1, Math.floor((x / max) * RAMPA.length))];
  const totalInst = (id: string) => colunas.reduce((s, t) => s + (horas.get(`${id}|${t.id}`)?.ag ?? 0), 0);

  return (
    <Secao id="matriz" titulo="Quem dá aula em cada turma"
           sub="Horas agendadas de cada instrutor por turma (todas as UCs). Quanto mais escuro, mais horas.">
      {!linhasInst.length ? <p className="muted vazio">Nenhuma aula lançada para o filtro escolhido.</p> : (
        <div className="tabela-rolagem">
          <table className="tabela matriz">
            <thead>
              <tr><th>Instrutor</th>{colunas.map((t) => <th key={t.id} className="num">{t.codigo ?? t.nome}</th>)}<th className="num">Total</th></tr>
            </thead>
            <tbody>
              {linhasInst.map((u) => (
                <tr key={u.id}>
                  <td className="nowrap"><span className="bolinha-inline" style={{ background: u.cor }} /> {u.nome}</td>
                  {colunas.map((t) => {
                    const v = horas.get(`${u.id}|${t.id}`);
                    if (!v) return <td key={t.id} className="matriz-vazia">—</td>;
                    const fundo = cor(v.ag);
                    const escuro = RAMPA.indexOf(fundo) >= 2;
                    return (
                      <td key={t.id} className="matriz-cel" style={{ background: fundo, color: escuro ? '#fff' : 'var(--texto)' }}
                          {...dica(`${u.nome} · ${t.codigo ?? t.nome}`, [
                            { valor: fmtH(v.ag), rotulo: 'agendadas' }, { valor: fmtH(v.re), rotulo: 'já realizadas' },
                            { valor: String(v.ucs), rotulo: v.ucs === 1 ? 'UC' : 'UCs' },
                          ])}>
                        {fmtH(v.ag)}
                      </td>
                    );
                  })}
                  <td className="num"><b>{fmtH(totalInst(u.id))}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Secao>
  );
}
