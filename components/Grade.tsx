'use client';
import { Item, TURNOS, Turno } from '@/lib/types';
import { DIAS, ddmm, hhmm, iso } from '@/lib/datas';
import Icone from './Icone';

export interface Cartao {
  titulo: string;
  sub?: string | null;
  cor: string;
  selo?: string; // ex.: "v0" nos itens importados da agenda antiga
  alerta?: string | null; // conflito de horário já gravado
  local?: string | null; // sala/laboratório (não aparece na agenda do próprio local)
}

interface Props {
  semanas: Date[][];
  mes: number;
  itens: Item[];
  grande?: boolean;
  compacto?: boolean; // agendas lado a lado
  descrever: (i: Item) => Cartao;
  onItem: (i: Item) => void;
  onCelula?: (data: Date, turno: Turno) => void; // sem isso a grade é só leitura
  podeCelula?: (data: Date, turno: Turno, itens: Item[]) => boolean; // esconde o "+" em células que não aceitam lançamento
  acoes?: (i: Item) => React.ReactNode; // ex.: ícones Material/PTD
}

/** Horário só aparece no cartão quando foge do horário padrão do turno. */
function horarioDiferente(i: Item): string | null {
  const t = TURNOS.find((x) => x.id === i.turno)!;
  const ini = hhmm(i.hora_inicio), fim = hhmm(i.hora_fim);
  return ini === t.inicio && fim === t.fim ? null : `${ini} – ${fim}`;
}

export default function Grade({ semanas, mes, itens, grande, compacto, descrever, onItem, onCelula, podeCelula, acoes }: Props) {
  const hoje = iso(new Date());
  const porCelula = new Map<string, Item[]>();
  for (const i of [...itens].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))) {
    const k = `${i.data}|${i.turno}`;
    porCelula.set(k, [...(porCelula.get(k) ?? []), i]);
  }

  return (
    <div className={`semanas ${grande ? 'grande' : ''} ${compacto ? 'compacto' : ''}`}>
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
                  <div key={iso(d)} className={`celula ${d.getMonth() !== mes ? 'fora' : ''} ${iso(d) === hoje ? 'hoje' : ''} ${onCelula ? 'editavel' : ''}`}>
                    {lista.map((i) => {
                      const c = descrever(i);
                      const extra = horarioDiferente(i);
                      return (
                        <div key={i.id} className={`cartao ${c.alerta ? 'com-conflito' : ''}`} style={{ '--c': c.cor } as React.CSSProperties}
                             title={c.alerta ? `Conflito de horário: ${c.alerta}` : undefined}>
                          <button type="button" className="cartao-corpo" onClick={() => onItem(i)}
                                  aria-label={`${DIAS[(d.getDay() + 6) % 7]} ${ddmm(d)}, ${t.nome}: ${c.titulo}`}>
                            <span className="nome">{c.alerta && <span className="selo-conflito" role="img" aria-label="Conflito de horário"><Icone nome="alerta" tamanho={14} /></span>}{c.titulo}{c.selo && <span className="selo-item">{c.selo}</span>}</span>
                            {c.alerta && <span className="sub alerta-txt">{c.alerta}</span>}
                            {c.sub && <span className="sub">{c.sub}</span>}
                            {c.local && <span className="local-txt"><Icone nome="locais" tamanho={12} />{c.local}</span>}
                            {extra && <span className="hora">{extra}</span>}
                          </button>
                          {acoes && i.tipo === 'aula' && <div className="cartao-acoes">{acoes(i)}</div>}
                        </div>
                      );
                    })}
                    {onCelula && (!podeCelula || podeCelula(d, t.id, lista)) && (
                      <button type="button" className={`adicionar ${lista.length ? 'mini' : ''}`}
                              onClick={() => onCelula(d, t.id)}
                              aria-label={`Lançar em ${DIAS[(d.getDay() + 6) % 7]} ${ddmm(d)}, ${t.nome}`}>
                        <Icone nome="mais" tamanho={16} />{!lista.length && <span>adicionar</span>}
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
