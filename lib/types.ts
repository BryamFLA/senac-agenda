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

/** Local da aula (sala, laboratório…). O item também pode ter um "outro local" só em texto (local_outro). */
export interface Local {
  id: string;
  nome: string;
  ordem: number;
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
  local_id: string | null;
  local_outro: string | null;
}

// Chamada e cadastro de alunos ficam FORA desta versão (decisão de 29/10/2026). O código e o banco estão prontos;
// para religar, troque para true (menu Alunos, alunos no cadastro da turma, botão Chamada no cartão da aula).
export const CHAMADA_ATIVA = false;

export interface Aluno {
  id: string;
  nome: string;
  email: string | null; // institucional
  codigo: string | null; // CodAluno do Senac
  ativo: boolean;
}

export type SituacaoMatricula = 'normal' | 'desligado';
export const SITUACOES_MATRICULA: { id: SituacaoMatricula; nome: string }[] = [
  { id: 'normal', nome: 'Normal' },
  { id: 'desligado', nome: 'Desligado (evadido)' },
];

export interface Matricula {
  turma_id: string;
  aluno_id: string;
  situacao: SituacaoMatricula;
}

/** Presenças da aula = duração ÷ hora-aula do curso, arredondado, no mínimo 1 (mesma conta de private.horas_chamada). */
export function horasChamada(ini: string, fim: string, horaAulaMin: number): number {
  return Math.max(1, Math.round(minutos(ini, fim) / horaAulaMin));
}

/** Conflito de horário já gravado (RPC ocorrencias_periodo): pinta cartões e nomes do filtro em vermelho. */
export interface Ocorrencia {
  item_id: string;
  instrutor_id: string;
  turma_id: string | null;
  local_id: string | null;
  motivo: string;
}

/** Dois itens no mesmo dia com horários que se cruzam. */
export const sobrepoe = (a: Item, b: Item) => a.data === b.data && a.hora_inicio < b.hora_fim && b.hora_inicio < a.hora_fim;

/** Cor dos eventos sem cor e dos locais (que não têm cor própria). */
export const COR_NEUTRA = '#64748B';

export const ITEM_CAMPOS =
  'id,tipo,data,hora_inicio,hora_fim,turno,instrutor_id,turma_id,uc_id,titulo,cor,trabalho,observacao,material_ok,ptd_ok,serie_id,origem,local_id,local_outro';

/** Horário padrão de cada turno — coluna da esquerda da grade. */
export const TURNOS: { id: Turno; nome: string; inicio: string; fim: string }[] = [
  { id: 'M', nome: 'Manhã', inicio: '08:00', fim: '12:00' },
  { id: 'T', nome: 'Tarde', inicio: '13:30', fim: '17:30' },
  { id: 'N', nome: 'Noite', inicio: '19:00', fim: '22:00' },
];
export const DIA_TODO = { inicio: '08:00', fim: '22:00' };

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

/** Ordem dos locais nas listas: a do cadastro, depois o nome. */
export const ordenarLocais = (a: Local, b: Local) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR');

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
  if (msg.includes('turmas_codigo_key')) return 'Já existe uma turma com esse código.';
  if (msg.includes('locais_nome_unico')) return 'Já existe um local com esse nome.';
  if (msg.includes('alunos_email_unico')) return 'Já existe um aluno com esse e-mail.';
  if (msg.includes('alunos_codigo_unico')) return 'Já existe um aluno com esse código.';
  if (msg.includes('matriculas_pkey')) return 'Esse aluno já está na turma.';
  if (msg.includes('presencas_item_id_fkey')) return 'Esta aula já tem chamada feita; não dá para apagar.';
  if (msg.includes('ucs_numero_unico')) return 'Já existe uma UC com esse número no curso.';
  if (e.code === '23503') return 'Não dá para apagar: há registros ligados a este item.';
  if (e.code === 'P0001' && msg) return msg;
  return padrao;
}
