import { importPKCS8, SignJWT } from 'jose';
import type { EventoGoogle } from './conferir.ts';
import { type Evento, FUSO } from './evento.ts';

interface ContaServico {
  client_email: string;
  private_key: string;
}

/** Token de acesso da conta de serviço (JWT RS256 → OAuth). Vale 1 h. */
export async function obterToken(conta: ContaServico): Promise<string> {
  const chave = await importPKCS8(conta.private_key, 'RS256');
  const agora = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/calendar.events' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(conta.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(agora)
    .setExpirationTime(agora + 3600)
    .sign(chave);

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!resp.ok) throw new Error(`token Google ${resp.status}: ${await resp.text()}`);
  const { access_token } = await resp.json();
  return access_token;
}

export class Calendario {
  constructor(private token: string, private calendarId: string) {}

  private url(resto = ''): string {
    return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events${resto}`;
  }

  private chamar(metodo: string, url: string, corpo?: unknown): Promise<Response> {
    return fetch(url, {
      method: metodo,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  }

  /** Atualiza o evento; se não existir, cria com o ID fixo. O update também restaura um evento apagado antes. */
  async salvar(ev: Evento): Promise<void> {
    const r = await this.chamar('PUT', this.url(`/${ev.id}`), ev);
    if (r.status === 404) {
      await r.body?.cancel();
      const c = await this.chamar('POST', this.url(), ev);
      if (!c.ok) throw new Error(`inserir ${ev.id}: ${c.status} ${await c.text()}`);
      await c.body?.cancel();
      return;
    }
    if (!r.ok) throw new Error(`atualizar ${ev.id}: ${r.status} ${await r.text()}`);
    await r.body?.cancel();
  }

  /** Apaga o evento; já apagado ou inexistente conta como sucesso. */
  async apagar(id: string): Promise<void> {
    const r = await this.chamar('DELETE', this.url(`/${id}`));
    if (!r.ok && r.status !== 404 && r.status !== 410) {
      throw new Error(`apagar ${id}: ${r.status} ${await r.text()}`);
    }
    await r.body?.cancel();
  }

  /** Eventos da agenda que terminam depois do início do dia (Brasília não tem horário de verão: -03:00). */
  async listarDesde(dia: string): Promise<EventoGoogle[]> {
    const eventos: EventoGoogle[] = [];
    let pageToken: string | undefined;
    do {
      const p = new URLSearchParams({
        timeMin: `${dia}T00:00:00-03:00`,
        singleEvents: 'true',
        showDeleted: 'false',
        maxResults: '2500',
        timeZone: FUSO,
      });
      if (pageToken) p.set('pageToken', pageToken);
      const r = await this.chamar('GET', this.url(`?${p}`));
      if (!r.ok) throw new Error(`listar: ${r.status} ${await r.text()}`);
      const corpo = await r.json();
      eventos.push(...(corpo.items ?? []));
      pageToken = corpo.nextPageToken;
    } while (pageToken);
    return eventos;
  }
}
