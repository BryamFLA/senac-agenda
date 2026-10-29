import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** O PostgREST devolve no máximo 1000 linhas por consulta: busca em páginas até acabar. */
export async function buscarTodos<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const tudo: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) return { data: tudo, error };
    tudo.push(...(data ?? []));
    if (!data || data.length < 1000) return { data: tudo, error: null };
  }
}

/** Chama uma Edge Function; se falhar, lança Error com a mensagem em português que a função devolve em `erro`. */
export async function invocar<T = unknown>(funcao: string, corpo: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(funcao, { body: corpo });
  if (!error) return data as T;
  let msg = error.message;
  try { msg = (await (error as { context: Response }).context.json()).erro ?? msg; } catch { /* resposta sem JSON */ }
  throw new Error(msg);
}
