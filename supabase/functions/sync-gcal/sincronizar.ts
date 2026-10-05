import { buscarDesde, buscarRegistro, type Db, gravarEventId } from './banco.ts';
import { chaveMomento, planejar } from './conferir.ts';
import { eventIdPara, eventoPara, hojeEmSaoPaulo, noEspelho } from './evento.ts';
import type { Calendario } from './google.ts';

/**
 * Disparo do trigger: espelha o estado atual do registro. Se o registro sumiu ou virou
 * feriado/férias (fora do espelho), apaga o evento.
 */
export async function sincronizarRegistro(db: Db, cal: Calendario, id: string) {
  const eventId = eventIdPara(id);
  const r = await buscarRegistro(db, id);
  if (!r || !noEspelho(r)) {
    await cal.apagar(eventId);
    if (r?.gcal_event_id) await gravarEventId(db, id, null);
    return { id, acao: 'apagado' };
  }
  await cal.salvar(eventoPara(r));
  if (r.gcal_event_id !== eventId) await gravarEventId(db, id, eventId);
  return { id, acao: 'salvo' };
}

/** Conferência: do dia de hoje (Brasília) em diante, o Google passa a refletir exatamente o banco. */
export async function conferir(db: Db, cal: Calendario, simular: boolean) {
  const dia = hojeEmSaoPaulo();
  const [registros, eventos] = await Promise.all([buscarDesde(db, dia), cal.listarDesde(dia)]);
  // a listagem traz também eventos que terminam hoje mas começaram antes; o passado não é tocado
  const futuros = eventos.filter((e) => chaveMomento(e.start).slice(0, 10) >= dia);
  const plano = planejar(registros, futuros);
  const resumo = {
    dia,
    criar: plano.criar.length,
    atualizar: plano.atualizar.length,
    apagar: plano.apagar.length,
  };
  if (simular) return { ...resumo, plano };

  const falhas: string[] = [];
  const tentar = async (oQue: string, acao: () => Promise<void>) => {
    try {
      await acao();
    } catch (e) {
      falhas.push(`${oQue}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  for (const ev of [...plano.criar, ...plano.atualizar]) await tentar(`salvar ${ev.id}`, () => cal.salvar(ev));
  for (const id of plano.apagar) await tentar(`apagar ${id}`, () => cal.apagar(id));
  for (const r of registros) {
    const eventId = noEspelho(r) ? eventIdPara(r.id) : null;
    if (r.gcal_event_id !== eventId) await tentar(`gravar ${r.id}`, () => gravarEventId(db, r.id, eventId));
  }
  return { ...resumo, falhas };
}
