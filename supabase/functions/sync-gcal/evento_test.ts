import { assertEquals } from '@std/assert';
import { eventIdPara, eventoPara, hojeEmSaoPaulo, noEspelho, RODAPE, type Registro } from './evento.ts';

const base: Registro = {
  id: '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b',
  data: '2026-10-06',
  turno: 'M',
  hora_inicio: '08:00:00',
  hora_fim: '12:00:00',
  observacao: null,
  gcal_event_id: null,
  compromisso: { nome: 'Assistente de TI', subtitulo: '202600012', tipo: 'aula' },
};

Deno.test('eventIdPara remove hífens e usa só caracteres aceitos pelo Google', () => {
  const id = eventIdPara(base.id);
  assertEquals(id, '3f2a9c1e5b7d4e8f9a0b1c2d3e4f5a6b');
  assertEquals(/^[0-9a-v]{5,1024}$/.test(id), true);
});

Deno.test('turno com horário vira evento com hora no fuso de São Paulo', () => {
  assertEquals(eventoPara(base), {
    id: '3f2a9c1e5b7d4e8f9a0b1c2d3e4f5a6b',
    summary: 'Assistente de TI',
    description: `202600012\n${RODAPE}`,
    start: { dateTime: '2026-10-06T08:00:00', timeZone: 'America/Sao_Paulo' },
    end: { dateTime: '2026-10-06T12:00:00', timeZone: 'America/Sao_Paulo' },
    colorId: '11',
    reminders: { useDefault: true },
    extendedProperties: { private: { agenda_id: base.id } },
    status: 'confirmed',
  });
});

Deno.test('horário próprio do compromisso é respeitado (Técnico IA 12:15–17:15)', () => {
  const ev = eventoPara({ ...base, turno: 'T', hora_inicio: '12:15:00', hora_fim: '17:15:00' });
  assertEquals(ev.start, { dateTime: '2026-10-06T12:15:00', timeZone: 'America/Sao_Paulo' });
  assertEquals(ev.end, { dateTime: '2026-10-06T17:15:00', timeZone: 'America/Sao_Paulo' });
});

Deno.test('sem horário vira evento de dia inteiro terminando no dia seguinte', () => {
  const ev = eventoPara({ ...base, data: '2026-12-31', hora_inicio: null, hora_fim: null });
  assertEquals(ev.start, { date: '2026-12-31' });
  assertEquals(ev.end, { date: '2027-01-01' });
});

Deno.test('só com início usa o fim do turno', () => {
  const ev = eventoPara({ ...base, turno: 'N', hora_inicio: '19:30:00', hora_fim: null });
  assertEquals(ev.end, { dateTime: '2026-10-06T22:00:00', timeZone: 'America/Sao_Paulo' });
});

Deno.test('observação entra entre o subtítulo e o rodapé', () => {
  const ev = eventoPara({ ...base, observacao: 'Sala 3' });
  assertEquals(ev.description, `202600012\nSala 3\n${RODAPE}`);
});

Deno.test('sem subtítulo nem observação fica só o rodapé', () => {
  const ev = eventoPara({ ...base, observacao: '  ', compromisso: { nome: 'Reunião', subtitulo: null, tipo: 'evento' } });
  assertEquals(ev.description, RODAPE);
});

Deno.test('feriado e férias ficam fora do espelho; o resto entra', () => {
  const comTipo = (tipo: string) => ({ ...base, compromisso: { ...base.compromisso, tipo } });
  assertEquals(noEspelho(comTipo('feriado')), false);
  assertEquals(noEspelho(comTipo('ferias')), false);
  assertEquals(noEspelho(comTipo('aula')), true);
  assertEquals(noEspelho(comTipo('evento')), true);
  assertEquals(noEspelho(comTipo('folga')), true);
});

Deno.test('hojeEmSaoPaulo usa o fuso de Brasília', () => {
  assertEquals(hojeEmSaoPaulo(new Date('2026-10-06T02:30:00Z')), '2026-10-05');
  assertEquals(hojeEmSaoPaulo(new Date('2026-10-06T03:30:00Z')), '2026-10-06');
});
