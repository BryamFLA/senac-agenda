// Cálculos do painel: tudo derivado da view `andamento`, dos itens do mês e das ocorrências (conflitos).
import type { Curso, Turma, UC } from '@/lib/types';
import { minutos } from '@/lib/types';

export interface LinhaAndamento {
  turma_id: string; uc_id: string; instrutor_id: string;
  aulas: number; horas_agendadas: number; horas_realizadas: number;
  primeira_aula: string | null; ultima_aula: string | null; proxima_aula: string | null;
  aulas_futuras: number; material_pendente: number; ptd_pendente: number;
}

export interface ItemPainel {
  id: string; tipo: 'aula' | 'evento'; data: string; hora_inicio: string; hora_fim: string;
  instrutor_id: string; turma_id: string | null; uc_id: string | null; titulo: string | null;
  trabalho: boolean; material_ok: boolean; ptd_ok: boolean;
}


/** Cores de status (reservadas: nunca usadas como série) — sempre com ícone + texto. */
export const STATUS = {
  bom: { cor: '#0ca30c', icone: '✓' },
  atencao: { cor: '#fab219', icone: '!' },
  serio: { cor: '#ec835a', icone: '▲' },
  critico: { cor: '#d03b3b', icone: '✕' },
  neutro: { cor: '#898781', icone: '○' },
} as const;
export type Status = keyof typeof STATUS;

export type SituacaoUC = 'concluida' | 'excedeu' | 'agendada' | 'parcial' | 'nao_iniciada';
export const ROTULO_UC: Record<SituacaoUC, [string, Status]> = {
  concluida: ['Concluída', 'bom'],
  excedeu: ['Passou da CH', 'critico'],
  agendada: ['Toda agendada', 'bom'],
  parcial: ['Falta lançar', 'serio'],
  nao_iniciada: ['Sem aulas', 'neutro'],
};

export interface ResumoUC {
  uc: UC; ch: number; agendado: number; realizado: number; aLancar: number; aulas: number; futuras: number;
  primeira: string | null; ultima: string | null; proxima: string | null; matPend: number; ptdPend: number;
  instrutores: { id: string; horas: number }[]; situacao: SituacaoUC;
}

export interface ResumoTurma {
  turma: Turma; curso: Curso | undefined; ucs: ResumoUC[];
  ch: number; agendado: number; realizado: number; aLancar: number;
  primeira: string | null; ultima: string | null; proxima: string | null; futuras: number;
  matPend: number; ptdPend: number; instrutores: Set<string>;
  situacao: { status: Status; texto: string; chave: 'concluida' | 'sem_aulas' | 'falta_lancar' | 'excedeu' | 'atrasada' | 'no_prazo' };
}

const menor = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b);
const maior = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);
const h = (x: number) => Math.round(x * 100) / 100;

export function resumirTurmas(turmas: Turma[], cursos: Curso[], ucs: UC[], linhas: LinhaAndamento[]): ResumoTurma[] {
  const cursoPor = new Map(cursos.map((c) => [c.id, c]));
  return turmas.map((turma) => {
    const minhas = linhas.filter((l) => l.turma_id === turma.id);
    const resumoUcs: ResumoUC[] = ucs.filter((u) => u.curso_id === turma.curso_id).sort((a, b) => a.numero - b.numero).map((uc) => {
      const ls = minhas.filter((l) => l.uc_id === uc.id);
      const agendado = h(ls.reduce((s, l) => s + Number(l.horas_agendadas), 0));
      const realizado = h(ls.reduce((s, l) => s + Number(l.horas_realizadas), 0));
      const ch = Number(uc.ch);
      const situacao: SituacaoUC = realizado >= ch - 0.01 ? 'concluida'
        : agendado > ch + 0.01 ? 'excedeu'
        : agendado >= ch - 0.01 ? 'agendada'
        : agendado > 0 ? 'parcial' : 'nao_iniciada';
      return {
        uc, ch, agendado, realizado, aLancar: Math.max(0, h(ch - agendado)),
        aulas: ls.reduce((s, l) => s + l.aulas, 0), futuras: ls.reduce((s, l) => s + l.aulas_futuras, 0),
        primeira: ls.reduce<string | null>((m, l) => menor(m, l.primeira_aula), null),
        ultima: ls.reduce<string | null>((m, l) => maior(m, l.ultima_aula), null),
        proxima: ls.reduce<string | null>((m, l) => menor(m, l.proxima_aula), null),
        matPend: ls.reduce((s, l) => s + l.material_pendente, 0), ptdPend: ls.reduce((s, l) => s + l.ptd_pendente, 0),
        instrutores: ls.map((l) => ({ id: l.instrutor_id, horas: Number(l.horas_agendadas) })).sort((a, b) => b.horas - a.horas),
        situacao,
      };
    });
    const soma = (f: (u: ResumoUC) => number) => h(resumoUcs.reduce((s, u) => s + f(u), 0));
    const ch = soma((u) => u.ch), agendado = soma((u) => u.agendado), realizado = soma((u) => u.realizado), aLancar = soma((u) => u.aLancar);
    const ultima = resumoUcs.reduce<string | null>((m, u) => maior(m, u.ultima), null);
    let situacao: ResumoTurma['situacao'];
    if (ch > 0 && realizado >= ch - 0.01) situacao = { status: 'bom', texto: 'Concluída', chave: 'concluida' };
    else if (agendado === 0) situacao = { status: 'neutro', texto: 'Sem aulas lançadas', chave: 'sem_aulas' };
    else if (aLancar > 0) situacao = { status: 'serio', texto: `Faltam lançar ${fmtH(aLancar)}`, chave: 'falta_lancar' };
    else if (resumoUcs.some((u) => u.situacao === 'excedeu')) {
      const n = resumoUcs.filter((u) => u.situacao === 'excedeu').length;
      situacao = { status: 'atencao', texto: `${n} UC${n > 1 ? 's' : ''} além da CH`, chave: 'excedeu' };
    }
    else if (turma.data_fim && ultima && ultima > turma.data_fim) situacao = { status: 'critico', texto: 'Termina depois do fim previsto', chave: 'atrasada' };
    else situacao = { status: 'bom', texto: 'Toda agendada', chave: 'no_prazo' };
    return {
      turma, curso: cursoPor.get(turma.curso_id), ucs: resumoUcs, ch, agendado, realizado, aLancar,
      primeira: resumoUcs.reduce<string | null>((m, u) => menor(m, u.primeira), null), ultima,
      proxima: resumoUcs.reduce<string | null>((m, u) => menor(m, u.proxima), null),
      futuras: resumoUcs.reduce((s, u) => s + u.futuras, 0),
      matPend: resumoUcs.reduce((s, u) => s + u.matPend, 0), ptdPend: resumoUcs.reduce((s, u) => s + u.ptdPend, 0),
      instrutores: new Set(minhas.map((l) => l.instrutor_id)), situacao,
    };
  });
}

/** Horas de trabalho de um dia pela união dos horários (aulas sobrepostas contam uma vez — mesma regra do RH). */
export function horasDoDia(itens: { hora_inicio: string; hora_fim: string }[]): number {
  const faixas = itens.map((i) => [minutos('00:00', i.hora_inicio), minutos('00:00', i.hora_fim)]).sort((a, b) => a[0] - b[0]);
  let total = 0, ini = -1, fim = -1;
  for (const [a, b] of faixas) {
    if (a > fim) { if (fim > ini) total += fim - ini; ini = a; fim = b; } else fim = Math.max(fim, b);
  }
  if (fim > ini) total += fim - ini;
  return total / 60;
}

export function fmtH(x: number): string {
  const min = Math.round(x * 60), hh = Math.floor(min / 60), mm = min % 60;
  return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`;
}
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
