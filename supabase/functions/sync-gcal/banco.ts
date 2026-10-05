import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Registro } from './evento.ts';

export type Db = SupabaseClient;

const CAMPOS =
  'id,data,turno,hora_inicio,hora_fim,observacao,gcal_event_id,compromisso:compromissos(nome,subtitulo)';

/** Cliente com a chave de serviço (ignora o RLS) — variáveis injetadas pelo Supabase na Edge Function. */
export function clienteBanco(): Db {
  const url = Deno.env.get('SUPABASE_URL');
  const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !chave) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes');
  return createClient(url, chave, { auth: { persistSession: false } });
}

export async function buscarRegistro(db: Db, id: string): Promise<Registro | null> {
  const { data, error } = await db.from('agenda').select(CAMPOS).eq('id', id).maybeSingle();
  if (error) throw new Error(`ler agenda ${id}: ${error.message}`);
  return data as unknown as Registro | null;
}

export async function buscarDesde(db: Db, dia: string): Promise<Registro[]> {
  const { data, error } = await db.from('agenda').select(CAMPOS).gte('data', dia).order('data').order('turno');
  if (error) throw new Error(`ler agenda desde ${dia}: ${error.message}`);
  return (data ?? []) as unknown as Registro[];
}

/** Grava o ID do evento. Os triggers de histórico e de sincronização ignoram essa mudança. */
export async function gravarEventId(db: Db, id: string, eventId: string): Promise<void> {
  const { error } = await db.from('agenda').update({ gcal_event_id: eventId }).eq('id', id);
  if (error) throw new Error(`gravar gcal_event_id ${id}: ${error.message}`);
}
