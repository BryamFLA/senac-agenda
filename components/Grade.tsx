'use client';
import { Compromisso, Registro, TURNOS, Turno } from '@/lib/types';
import { DIAS, ddmm, hhmm, iso } from '@/lib/datas';

interface Props {
  semanas: Date[][];
  mes: number;
  registros: Map<string, Registro>; // chave `${data}|${turno}`
  compromissos: Map<string, Compromisso>;
  onCelula: (data: Date, turno: Turno, registro: Registro | null) => void;
}

/** Horário só aparece no cartão quando foge do horário padrão do turno. */
function horarioDiferente(r: Registro, t: (typeof TURNOS)[number]): string | null {
  if (!r.hora_inicio) return null;
  const ini = hhmm(r.hora_inicio), fim = hhmm(r.hora_fim);
  if (ini === t.inicio && (!fim || fim === t.fim)) return null;
  return fim ? `${ini} – ${fim}` : ini;
}

export default function Grade({ semanas, mes, registros, compromissos, onCelula }: Props) {
  const hoje = iso(new Date());
  return (
    <div className="semanas">
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
                const r = registros.get(`${iso(d)}|${t.id}`) ?? null;
                const c = r ? compromissos.get(r.compromisso_id) : undefined;
                const extra = r ? horarioDiferente(r, t) : null;
                const sub = r?.observacao || c?.subtitulo;
                return (
                  <button key={iso(d)} type="button"
                          className={`celula ${d.getMonth() !== mes ? 'fora' : ''}`}
                          onClick={() => onCelula(d, t.id, r)}
                          aria-label={`${DIAS[(d.getDay() + 6) % 7]} ${ddmm(d)}, ${t.nome}: ${c?.nome ?? 'livre'}`}>
                    {c ? (
                      <span className="cartao" style={{ '--c': c.cor } as React.CSSProperties}>
                        <span className="nome">{c.nome}</span>
                        {sub && <span className="sub">{sub}</span>}
                        {extra && <span className="hora">{extra}</span>}
                      </span>
                    ) : (
                      <span className="adicionar">+ adicionar</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
