import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { ESQUEMA_GERAL, ESQUEMA_UC, SISTEMA_GERAL, SISTEMA_UC } from './esquemas.ts';

// Lê uma parte do texto do plano de curso (extraído no navegador) e devolve os dados estruturados.
// Corpo: {parte: 'geral', texto} ou {parte: 'uc', numero, texto}. Só gestores (admin/tept).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function eGestor(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization');
  if (!auth) return false;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return false;
  const { data } = await sb.from('usuarios').select('papel, ativo').eq('id', u.user.id).maybeSingle();
  return !!data?.ativo && (data.papel === 'admin' || data.papel === 'tept');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { erro: 'use POST' });
  if (!(await eGestor(req))) return json(403, { erro: 'Sem permissão.' });

  const chave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chave) return json(500, { erro: 'ANTHROPIC_API_KEY não configurada nas secrets das Edge Functions.' });

  let corpo: { parte?: unknown; texto?: unknown; numero?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return json(400, { erro: 'corpo JSON inválido' });
  }
  const { parte, texto, numero } = corpo;
  if ((parte !== 'geral' && parte !== 'uc') || typeof texto !== 'string' || !texto.trim()) {
    return json(400, { erro: 'informe {parte: "geral" | "uc", texto}' });
  }

  const geral = parte === 'geral';
  const pedido = geral
    ? 'Extraia a identificação do curso e a lista de UCs deste trecho do plano de curso.'
    : `Extraia o detalhamento da Unidade Curricular ${numero ?? ''} deste trecho do plano de curso.`;

  const client = new Anthropic({ apiKey: chave });
  try {
    const params = {
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: geral ? ESQUEMA_GERAL : ESQUEMA_UC },
      },
      system: geral ? SISTEMA_GERAL : SISTEMA_UC,
      messages: [{ role: 'user', content: `${pedido}\n\n<plano>\n${texto}\n</plano>` }],
    };
    // deno-lint-ignore no-explicit-any
    const resp = await client.beta.messages.create(params as any);
    if (resp.stop_reason === 'refusal') return json(502, { erro: 'A IA recusou o pedido. Tente de novo.' });
    if (resp.stop_reason === 'max_tokens') return json(502, { erro: 'Resposta da IA cortada (texto grande demais).' });
    const bloco = resp.content.find((b) => b.type === 'text');
    if (!bloco || bloco.type !== 'text') return json(502, { erro: 'Resposta da IA sem conteúdo.' });
    return json(200, JSON.parse(bloco.text));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(429, { erro: 'Limite da IA atingido; tente em instantes.' });
    if (e instanceof Anthropic.APIError) return json(502, { erro: `Erro da IA (${e.status}): ${e.message}` });
    return json(500, { erro: e instanceof Error ? e.message : String(e) });
  }
});
