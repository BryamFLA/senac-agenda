import { FIM_DO_TURNO, type Turno } from './turnos.ts';

export const FUSO = 'America/Sao_Paulo';
/** Vermelho ("Tomate"): no Google do Bryam a cor separa entidades, não eventos. */
export const COR_SENAC = '11';
export const RODAPE = 'Gerado por agenda.bryam.com.br — não edite aqui, alterações são sobrescritas.';

/** Linha de `agenda` com o compromisso já juntado. */
export interface Registro {
  id: string;
  data: string; // YYYY-MM-DD
  turno: Turno;
  hora_inicio: string | null; // HH:MM:SS
  hora_fim: string | null;
  observacao: string | null;
  gcal_event_id: string | null;
  compromisso: { nome: string; subtitulo: string | null; tipo: string };
}

/** Tipos que não vão para o Google (decisão do Bryam): ocupam os 3 turnos e só poluiriam a agenda. */
const FORA_DO_ESPELHO = ['feriado', 'ferias'];

export function noEspelho(r: Registro): boolean {
  return !FORA_DO_ESPELHO.includes(r.compromisso.tipo);
}

export type Momento = { dateTime: string; timeZone: string } | { date: string };

/** Corpo enviado à API de eventos do Google. */
export interface Evento {
  id: string;
  summary: string;
  description: string;
  start: Momento;
  end: Momento;
  colorId: string;
  reminders: { useDefault: boolean };
  extendedProperties: { private: { agenda_id: string } };
  status: 'confirmed';
}

/** ID do evento derivado do registro: uuid sem hífens (0-9a-f cabe no base32hex exigido pelo Google). */
export function eventIdPara(agendaId: string): string {
  return agendaId.replaceAll('-', '').toLowerCase();
}

function diaSeguinte(data: string): string {
  const [a, m, d] = data.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + 1));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

const hhmmss = (h: string) => (h.length === 5 ? `${h}:00` : h.slice(0, 8));

export function eventoPara(r: Registro): Evento {
  const linhas = [r.compromisso.subtitulo, r.observacao, RODAPE]
    .filter((l): l is string => !!l && l.trim() !== '');

  let start: Momento;
  let end: Momento;
  if (!r.hora_inicio) {
    start = { date: r.data };
    end = { date: diaSeguinte(r.data) };
  } else {
    const fim = r.hora_fim ?? FIM_DO_TURNO[r.turno];
    start = { dateTime: `${r.data}T${hhmmss(r.hora_inicio)}`, timeZone: FUSO };
    end = { dateTime: `${r.data}T${hhmmss(fim)}`, timeZone: FUSO };
  }

  return {
    id: eventIdPara(r.id),
    summary: r.compromisso.nome,
    description: linhas.join('\n'),
    start,
    end,
    colorId: COR_SENAC,
    reminders: { useDefault: true },
    extendedProperties: { private: { agenda_id: r.id } },
    status: 'confirmed',
  };
}

/** Data de hoje (YYYY-MM-DD) no fuso de Brasília. */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(agora);
}
