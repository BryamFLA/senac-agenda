'use client';
import { createContext, useContext } from 'react';
import type { Curso, Turma, UC, Usuario } from '@/lib/types';

/** Cadastros carregados uma vez no login e compartilhados pelas telas. */
export interface Cadastros {
  eu: Usuario;
  usuarios: Usuario[];
  cursos: Curso[];
  ucs: UC[];
  turmas: Turma[];
  recarregar: () => Promise<void>;
}

export const CadastrosCtx = createContext<Cadastros | null>(null);

export function useCadastros(): Cadastros {
  const c = useContext(CadastrosCtx);
  if (!c) throw new Error('useCadastros fora do provedor');
  return c;
}

/** Mapas por id, para montar os cartões sem buscas repetidas. */
export function indices(c: Cadastros) {
  return {
    usuario: new Map(c.usuarios.map((u) => [u.id, u])),
    turma: new Map(c.turmas.map((t) => [t.id, t])),
    uc: new Map(c.ucs.map((u) => [u.id, u])),
    curso: new Map(c.cursos.map((x) => [x.id, x])),
  };
}
