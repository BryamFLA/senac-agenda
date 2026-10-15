// Datas sempre como 'YYYY-MM-DD' no fuso local, sem conversão para UTC.
export const DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
export const DIAS_LONGOS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
  'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function segundaDaSemana(d: Date): Date {
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  return addDays(d, -dow);
}

/** Semanas (segunda a sábado) que tocam o mês. */
export function semanasDoMes(ano: number, mes: number): Date[][] {
  const primeiro = new Date(ano, mes, 1);
  const ultimo = new Date(ano, mes + 1, 0);
  const semanas: Date[][] = [];
  for (let seg = segundaDaSemana(primeiro); seg <= ultimo; seg = addDays(seg, 7)) {
    semanas.push(Array.from({ length: 6 }, (_, i) => addDays(seg, i)));
  }
  return semanas;
}

export function ddmm(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : '';
}

/** 'YYYY-MM-DD' → Date local (meia-noite), sem passar por UTC. */
export function deIso(s: string): Date {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d);
}

/** Dias de segunda a sábado de um mês. */
export function diasUteisDoMes(ano: number, mes: number): Date[] {
  const r: Date[] = [];
  for (let d = new Date(ano, mes, 1); d.getMonth() === mes; d = addDays(d, 1)) {
    if (d.getDay() !== 0) r.push(d);
  }
  return r;
}

export const diaSemana = (d: Date) => (d.getDay() + 6) % 7; // 0 = segunda … 5 = sábado
