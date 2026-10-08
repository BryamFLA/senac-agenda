'use client';
import { Item, TURNOS, Turno } from '@/lib/types';
import { DIAS, ddmm, hhmm, iso } from '@/lib/datas';

export interface Cartao {
  titulo: string;
  sub?: string | null;
  cor: string;
  selo?: string; // ex.: "v0" nos itens importados da agenda antiga
}

interface Props {
  semanas: Date[][];
  mes: number;
  itens: Item[];
  grande?: boolean;
  descrever: (i: Item) => Cartao;
  onItem: (i: Item) => void;
  onCelula?: (data: Date, turno: Turno) => void; // sem isso a grade é só leitura
  acoes?: (i: Item) => React.ReactNode; // ex.: ícones Material/PTD
}

/** Horário só aparece no cartão quando foge do horário padrão do turno. */
function horarioDiferente(i: Item): string | null {
  const t = TURNOS.find((x) => x.id === i.turno)!;
  const ini = hhmm(i.hora_inicio), fim = hhmm(i.hora_fim);
  return ini === t.inicio && fim === t.fim ? null : `${ini} – ${fim}`;
}

export default function Grade({ semanas, mes, itens, grande, descrever, onItem, onCelula, acoes }: Props) {
  const hoje = iso(new Date());
  const porCelula = new Map<string, Item[]>();
  for (const i of [...itens].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))) {
    const k = `${i.data}|${i.turno}`;
    porCelula.set(k, [...(porCelula.get(k) ?? []), i]);
  }

  return (
    <div className={`semanas ${grande ? 'grande' : ''}`}>
      {semanas.map((dias) => (
        <section key={iso(dias[0])} className="semana">
          <div className="g cabeca">
            <div className="canto" />
            {dias.map((d, i) => {
              const ehHoje = iso(d) === hoje;
              return (
                <div key={i} className={`dia ${ehHoje ? 'hoje' : ''} ${d.getMonth() !== mes ? 'fora' : ''}`}>
                  <span className="dia-nome">{DIAS[i]}</span>
                  <span className="dia-num">{ddmm(d)}</span>
                  {ehHoje && <span className="selo">hoje</span>}
                </div>
              );
            })}
          </div>
          {TURNOS.map((t) => (
            <div key={t.id} className="g linha-turno">
              <div className="turno">
                <span className="turno-nome">{t.nome}</span>
                <span className="turno-hora">{t.inicio} – {t.fim}</span>
              </div>
              {dias.map((d) => {
                const lista = porCelula.get(`${iso(d)}|${t.id}`) ?? [];
                return (
                  <div key={iso(d)} className={`celula ${d.getMonth() !== mes ? 'fora' : ''} ${onCelula ? 'editavel' : ''}`}>
                    {lista.map((i) => {
                      const c = descrever(i);
                      const extra = horarioDiferente(i);
                      return (
                        <div key={i.id} className="cartao" style={{ '--c': c.cor } as React.CSSProperties}>
                          <button type="button" className="cartao-corpo" onClick={() => onItem(i)}
                                  aria-label={`${DIAS[(d.getDay() + 6) % 7]} ${ddmm(d)}, ${t.nome}: ${c.titulo}`}>
                            <span className="nome">{c.titulo}{c.selo && <span className="selo-item">{c.selo}</span>}</span>
                            {c.sub && <span className="sub">{c.sub}</span>}
                            {extra && <span className="hora">{extra}</span>}
                          </button>
                          {acoes && i.tipo === 'aula' && <div className="cartao-acoes">{acoes(i)}</div>}
                        </div>
                      );
                    })}
                    {onCelula && (
                      <button type="button" className={`adicionar ${lista.length ? 'mini' : ''}`}
                              onClick={() => onCelula(d, t.id)}
                              aria-label={`Lançar em ${DIAS[(d.getDay() + 6) % 7]} ${ddmm(d)}, ${t.nome}`}>
                        {lista.length ? '+' : '+ adicionar'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
