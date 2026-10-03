export type Turno = 'M' | 'T' | 'N';
export type Tipo = 'aula' | 'planejamento' | 'evento' | 'feriado' | 'ferias' | 'folga' | 'outro';

export interface Compromisso {
  id: string;
  nome: string;
  subtitulo: string | null;
  codigo_turma: string | null;
  tipo: Tipo;
  hora_inicio_padrao: string | null;
  hora_fim_padrao: string | null;
  cor: string; // #RRGGBB
  ativo: boolean;
}

export interface Registro {
  id: string;
  data: string; // YYYY-MM-DD
  turno: Turno;
  compromisso_id: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  observacao: string | null;
  gcal_event_id: string | null;
  updated_at: string;
}

/** Horário fixo de cada turno — aparece na coluna da esquerda da grade. */
export const TURNOS: { id: Turno; nome: string; inicio: string; fim: string }[] = [
  { id: 'M', nome: 'Manhã', inicio: '08:00', fim: '12:00' },
  { id: 'T', nome: 'Tarde', inicio: '13:30', fim: '17:30' },
  { id: 'N', nome: 'Noite', inicio: '19:00', fim: '22:00' },
];

export const turnoInfo = (t: Turno) => TURNOS.find((x) => x.id === t)!;

/** Paleta oferecida no cadastro (dá para escolher outra cor livremente). */
export const CORES = [
  '#004A8D', '#F7941D', '#7C3AED', '#0E9F6E', '#DB2777', '#0891B2', '#CA8A04',
  '#65A30D', '#C026D3', '#E11D48', '#4F46E5', '#DC2626', '#16A34A', '#64748B',
];

/** Tipos sem horário (ocupam o turno inteiro). */
export const TIPOS_SEM_HORARIO: Tipo[] = ['feriado', 'ferias', 'folga'];

function turnoDoHorario(h: string): Turno {
  const hh = Number(h.slice(0, 2));
  return hh < 12 ? 'M' : hh < 18 ? 'T' : 'N';
}

/**
 * Horário gravado no banco para um compromisso num turno.
 * Usa o horário próprio do compromisso quando ele pertence a esse turno
 * (ex.: Técnico IA 12:15–17:15); senão, o horário padrão do turno.
 */
export function horarioPara(c: Compromisso, t: Turno): { inicio: string | null; fim: string | null } {
  if (TIPOS_SEM_HORARIO.includes(c.tipo)) return { inicio: null, fim: null };
  if (c.hora_inicio_padrao && turnoDoHorario(c.hora_inicio_padrao) === t) {
    return { inicio: c.hora_inicio_padrao.slice(0, 5), fim: c.hora_fim_padrao?.slice(0, 5) ?? null };
  }
  const p = turnoInfo(t);
  return { inicio: p.inicio, fim: p.fim };
}
