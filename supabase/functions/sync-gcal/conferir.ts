import { type Evento, eventoPara, noEspelho, type Registro } from './evento.ts';

/** Evento como vem da listagem do Google (só os campos comparados). */
export interface EventoGoogle {
  id: string;
  summary?: string;
  description?: string;
  colorId?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
}

export interface Plano {
  criar: Evento[];
  atualizar: Evento[];
  apagar: string[];
}

/** 'YYYY-MM-DD' (dia inteiro) ou 'YYYY-MM-DDTHH:MM:SS' (hora local, sem o deslocamento do fuso). */
export function chaveMomento(m: { date?: string; dateTime?: string }): string {
  return m.date ?? (m.dateTime ?? '').slice(0, 19);
}

function mesmoConteudo(esperado: Evento, atual: EventoGoogle): boolean {
  return esperado.summary === (atual.summary ?? '')
    && esperado.description === (atual.description ?? '')
    && esperado.colorId === (atual.colorId ?? '')
    && chaveMomento(esperado.start) === chaveMomento(atual.start)
    && chaveMomento(esperado.end) === chaveMomento(atual.end);
}

/**
 * Compara o banco (fonte da verdade) com o Google e diz o que criar, atualizar e apagar.
 * Registros fora do espelho (feriado, férias) são ignorados — e o evento deles, se existir, é apagado.
 */
export function planejar(registros: Registro[], eventos: EventoGoogle[]): Plano {
  const atuais = new Map(eventos.map((e) => [e.id, e]));
  const esperados = new Set<string>();
  const plano: Plano = { criar: [], atualizar: [], apagar: [] };

  for (const r of registros.filter(noEspelho)) {
    const ev = eventoPara(r);
    esperados.add(ev.id);
    const atual = atuais.get(ev.id);
    if (!atual) plano.criar.push(ev);
    else if (!mesmoConteudo(ev, atual)) plano.atualizar.push(ev);
  }
  for (const e of eventos) {
    if (!esperados.has(e.id)) plano.apagar.push(e.id);
  }
  return plano;
}
