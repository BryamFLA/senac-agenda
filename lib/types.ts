export type Turno = 'M' | 'T' | 'N';
export type Papel = 'admin' | 'tept' | 'instrutor';

export interface Usuario {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
  leciona: boolean;
  cor: string;
  ativo: boolean;
}

export interface Curso {
  id: string;
  nome: string;
  eixo: string | null;
  segmento: string | null;
  ch_total: number;
  codigo_dn: string | null;
  cbo: string | null;
  hora_aula_min: number;
  ativo: boolean;
}

export interface UC {
  id: string;
  curso_id: string;
  numero: number;
  nome: string;
  ch: number;
  tipo: 'regular' | 'projeto_integrador';
  indicadores: string[];
  conhecimentos: string[];
  habilidades: string[];
  atitudes: string[];
  integra: number[];
}

export interface Turma {
  id: string;
  curso_id: string;
  codigo: string | null;
  nome: string;
  cor: string;
  data_inicio: string | null;
  data_fim: string | null;
  ativo: boolean;
}

export interface Item {
  id: string;
  tipo: 'aula' | 'evento';
  data: string; // YYYY-MM-DD
  hora_inicio: string; // HH:MM:SS
  hora_fim: string;
  turno: Turno;
  instrutor_id: string;
  turma_id: string | null;
  uc_id: string | null;
  titulo: string | null;
  cor: string | null;
  trabalho: boolean;
  observacao: string | null;
  material_ok: boolean;
  ptd_ok: boolean;
  serie_id: string | null;
  origem: 'v1' | 'v0';
}

export interface Progresso {
  turma_id: string;
  uc_id: string;
  aulas: number;
  horas_agendadas: number;
  horas_realizadas: number;
}

export const ITEM_CAMPOS =
  'id,tipo,data,hora_inicio,hora_fim,turno,instrutor_id,turma_id,uc_id,titulo,cor,trabalho,observacao,material_ok,ptd_ok,serie_id,origem';

/** Horário padrão de cada turno — coluna da esquerda da grade. */
export const TURNOS: { id: Turno; nome: string; inicio: string; fim: string }[] = [
  { id: 'M', nome: 'Manhã', inicio: '08:00', fim: '12:00' },
  { id: 'T', nome: 'Tarde', inicio: '13:30', fim: '17:30' },
  { id: 'N', nome: 'Noite', inicio: '19:00', fim: '22:00' },
];
export const DIA_TODO = { inicio: '08:00', fim: '22:00' };

export const turnoInfo = (t: Turno) => TURNOS.find((x) => x.id === t)!;

/** Mesma regra da coluna gerada itens.turno no banco. */
export function turnoDoHorario(h: string): Turno {
  return h < '12:00' ? 'M' : h < '18:00' ? 'T' : 'N';
}

/** Paleta oferecida nos cadastros (dá para escolher outra cor livremente). */
export const CORES = [
  '#004A8D', '#F7941D', '#7C3AED', '#0E9F6E', '#DB2777', '#0891B2', '#CA8A04',
  '#65A30D', '#C026D3', '#E11D48', '#4F46E5', '#DC2626', '#16A34A', '#64748B',
];

export const PAPEIS: { id: Papel; nome: string }[] = [
  { id: 'tept', nome: 'TEPT (gestão)' },
  { id: 'instrutor', nome: 'Instrutor' },
  { id: 'admin', nome: 'Administrador' },
];

export const eGestor = (u: Usuario | null | undefined) => !!u && (u.papel === 'admin' || u.papel === 'tept');

/** Minutos entre dois horários 'HH:MM[:SS]'. */
export function minutos(ini: string, fim: string): number {
  const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  return m(fim) - m(ini);
}

/** 90 → "1h30", 240 → "4h", 7.5 (horas) via horas() */
export function fmtMin(min: number): string {
  const h = Math.floor(Math.abs(min) / 60), m = Math.round(Math.abs(min) % 60);
  const s = m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  return min < 0 ? `-${s}` : s;
}
export const fmtHoras = (h: number) => fmtMin(Math.round(h * 60));

/** Traduz erros do PostgREST/Postgres para mensagens da tela. */
export function mensagemErro(e: { message?: string; code?: string } | null | undefined, padrao = 'Não foi possível salvar.'): string {
  if (!e) return padrao;
  const msg = e.message ?? '';
  if (msg.includes('itens_sem_choque_instrutor')) return 'O instrutor já tem outro compromisso nesse horário.';
  if (msg.includes('itens_sem_choque_turma')) return 'A turma já tem aula nesse horário.';
  if (msg.includes('turmas_codigo_key')) return 'Já existe uma turma com esse código.';
  if (msg.includes('ucs_numero_unico')) return 'Já existe uma UC com esse número no curso.';
  if (e.code === '23503') return 'Não dá para apagar: há registros ligados a este item.';
  if (e.code === 'P0001' && msg) return msg;
  return padrao;
}
