import { clienteBanco } from './banco.ts';
import { Calendario, obterToken } from './google.ts';
import { conferir, sincronizarRegistro } from './sincronizar.ts';

// Chamada pelo trigger de public.agenda ({id}) e pelo pg_cron ({conferir: true}).
// {conferir: true, simular: true} responde o plano sem tocar no Google (uso manual).
// Protegida pelo header x-sync-secret (verify_jwt desligado).

/** Global do runtime de Edge Functions do Supabase: mantém a tarefa viva depois da resposta. */
declare const EdgeRuntime: { waitUntil(tarefa: Promise<unknown>): void };

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

async function calendario(): Promise<Calendario> {
  const conta = JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? 'null');
  const calendarId = Deno.env.get('GCAL_CALENDAR_ID');
  if (!conta || !calendarId) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON/GCAL_CALENDAR_ID ausentes');
  return new Calendario(await obterToken(conta), calendarId);
}

function emSegundoPlano(nome: string, tarefa: () => Promise<unknown>) {
  EdgeRuntime.waitUntil(
    tarefa()
      .then((r) => console.log(nome, JSON.stringify(r)))
      .catch((e) => console.error(`${nome} falhou:`, e instanceof Error ? e.message : e)),
  );
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { erro: 'use POST' });
  const segredo = Deno.env.get('SYNC_SECRET');
  if (!segredo || req.headers.get('x-sync-secret') !== segredo) return json(401, { erro: 'não autorizado' });

  let corpo: { id?: unknown; conferir?: unknown; simular?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return json(400, { erro: 'corpo JSON inválido' });
  }

  const db = clienteBanco();

  if (corpo.conferir === true && corpo.simular === true) {
    try {
      return json(200, await conferir(db, await calendario(), true));
    } catch (e) {
      return json(500, { erro: e instanceof Error ? e.message : String(e) });
    }
  }
  if (corpo.conferir === true) {
    emSegundoPlano('conferência', async () => conferir(db, await calendario(), false));
    return json(202, { ok: true });
  }
  if (typeof corpo.id === 'string') {
    const id = corpo.id;
    emSegundoPlano(`registro ${id}`, async () => sincronizarRegistro(db, await calendario(), id));
    return json(202, { ok: true });
  }
  return json(400, { erro: 'informe {id} ou {conferir: true}' });
});
