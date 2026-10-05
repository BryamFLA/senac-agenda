// Cópia do fim de cada turno de TURNOS em lib/types.ts (o Deno não importa o código do Next).
// Se o horário de um turno mudar lá, mude aqui também.
export type Turno = 'M' | 'T' | 'N';

export const FIM_DO_TURNO: Record<Turno, string> = { M: '12:00', T: '17:30', N: '22:00' };
