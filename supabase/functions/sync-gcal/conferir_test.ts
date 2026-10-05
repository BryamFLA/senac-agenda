import { assertEquals } from '@std/assert';
import { type EventoGoogle, planejar } from './conferir.ts';
import { type Evento, eventoPara, type Registro } from './evento.ts';

const reg = (n: number, extra: Partial<Registro> = {}): Registro => ({
  id: `00000000-0000-0000-0000-00000000000${n}`,
  data: '2026-10-06',
  turno: 'M',
  hora_inicio: '08:00:00',
  hora_fim: '12:00:00',
  observacao: null,
  gcal_event_id: null,
  compromisso: { nome: 'Assistente de TI', subtitulo: '202600012' },
  ...extra,
});

/** Como o Google devolve o evento na listagem (dateTime com deslocamento de fuso). */
const comoGoogle = (ev: Evento): EventoGoogle => ({
  id: ev.id,
  summary: ev.summary,
  description: ev.description,
  colorId: ev.colorId,
  start: 'dateTime' in ev.start ? { dateTime: `${ev.start.dateTime}-03:00` } : { date: ev.start.date },
  end: 'dateTime' in ev.end ? { dateTime: `${ev.end.dateTime}-03:00` } : { date: ev.end.date },
});

Deno.test('registro sem evento vai para criar', () => {
  const plano = planejar([reg(1)], []);
  assertEquals(plano.criar.map((e) => e.id), ['00000000000000000000000000000001']);
  assertEquals(plano.atualizar, []);
  assertEquals(plano.apagar, []);
});

Deno.test('evento igual ao esperado não gera ação', () => {
  const r = reg(1);
  const plano = planejar([r], [comoGoogle(eventoPara(r))]);
  assertEquals(plano, { criar: [], atualizar: [], apagar: [] });
});

Deno.test('evento de dia inteiro igual não gera ação', () => {
  const r = reg(1, { hora_inicio: null, hora_fim: null });
  const plano = planejar([r], [comoGoogle(eventoPara(r))]);
  assertEquals(plano, { criar: [], atualizar: [], apagar: [] });
});

Deno.test('título diferente vai para atualizar', () => {
  const r = reg(1);
  const atual = { ...comoGoogle(eventoPara(r)), summary: 'Nome antigo' };
  assertEquals(planejar([r], [atual]).atualizar.map((e) => e.summary), ['Assistente de TI']);
});

Deno.test('descrição diferente vai para atualizar', () => {
  const r = reg(1, { observacao: 'Sala 3' });
  const atual = comoGoogle(eventoPara(reg(1)));
  assertEquals(planejar([r], [atual]).atualizar.length, 1);
});

Deno.test('horário diferente vai para atualizar', () => {
  const r = reg(1);
  const atual = comoGoogle(eventoPara(reg(1, { hora_inicio: '13:30:00', hora_fim: '17:30:00' })));
  assertEquals(planejar([r], [atual]).atualizar.length, 1);
});

Deno.test('cor ausente ou diferente vai para atualizar', () => {
  const r = reg(1);
  const atual = { ...comoGoogle(eventoPara(r)), colorId: undefined };
  assertEquals(planejar([r], [atual]).atualizar.length, 1);
});

Deno.test('evento sem registro correspondente vai para apagar', () => {
  const sobra = comoGoogle(eventoPara(reg(2)));
  const plano = planejar([reg(1)], [sobra]);
  assertEquals(plano.apagar, ['00000000000000000000000000000002']);
  assertEquals(plano.criar.length, 1);
});
