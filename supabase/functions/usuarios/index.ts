import { createClient } from '@supabase/supabase-js';

// Cria acessos e redefine senhas (precisa da service role, por isso não roda no navegador). Só gestores.
// {acao: 'criar', nome, email, papel, leciona, cor, senha}  → cria no Auth + em public.usuarios
// {acao: 'senha', id, senha}                                → troca a senha de um usuário

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PAPEIS = ['admin', 'tept', 'instrutor'];
const COR = /^#[0-9A-Fa-f]{6}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { erro: 'use POST' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization');
  if (!auth) return json(401, { erro: 'Faça login.' });
  const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: eu } = await comoUsuario.auth.getUser();
  if (!eu.user) return json(401, { erro: 'Faça login.' });
  const { data: perfil } = await comoUsuario.from('usuarios').select('papel, ativo').eq('id', eu.user.id).maybeSingle();
  if (!perfil?.ativo || !['admin', 'tept'].includes(perfil.papel)) return json(403, { erro: 'Sem permissão.' });

  // deno-lint-ignore no-explicit-any
  let c: any;
  try {
    c = await req.json();
  } catch {
    return json(400, { erro: 'corpo JSON inválido' });
  }
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const senhaOk = (s: unknown) => typeof s === 'string' && s.length >= 8;

  if (c.acao === 'criar') {
    const email = String(c.email ?? '').trim().toLowerCase();
    const nome = String(c.nome ?? '').trim();
    const papel = String(c.papel ?? '');
    const leciona = papel === 'instrutor' || c.leciona === true;
    const cor = COR.test(c.cor ?? '') ? c.cor : '#004A8D';
    if (!nome || !/^\S+@\S+\.\S+$/.test(email)) return json(400, { erro: 'Informe nome e e-mail válidos.' });
    if (!PAPEIS.includes(papel)) return json(400, { erro: 'Papel inválido.' });
    if (papel === 'admin' && perfil.papel !== 'admin') return json(403, { erro: 'Só o admin cria outro admin.' });
    if (!senhaOk(c.senha)) return json(400, { erro: 'A senha inicial precisa ter pelo menos 8 caracteres.' });

    const { data: criado, error } = await admin.auth.admin.createUser({ email, password: c.senha, email_confirm: true });
    if (error || !criado.user) {
      const jaExiste = /already|registered|exists/i.test(error?.message ?? '');
      return json(400, { erro: jaExiste ? 'Já existe um acesso com esse e-mail.' : `Falha ao criar acesso: ${error?.message}` });
    }
    const { error: e2 } = await admin.from('usuarios').insert({ id: criado.user.id, email, nome, papel, leciona, cor });
    if (e2) {
      await admin.auth.admin.deleteUser(criado.user.id);
      return json(400, { erro: `Falha ao gravar o usuário: ${e2.message}` });
    }
    return json(200, { id: criado.user.id });
  }

  if (c.acao === 'senha') {
    if (typeof c.id !== 'string') return json(400, { erro: 'Usuário não informado.' });
    if (!senhaOk(c.senha)) return json(400, { erro: 'A senha precisa ter pelo menos 8 caracteres.' });
    const { data: alvo } = await admin.from('usuarios').select('papel').eq('id', c.id).maybeSingle();
    if (!alvo) return json(404, { erro: 'Usuário não encontrado.' });
    if (alvo.papel === 'admin' && perfil.papel !== 'admin') return json(403, { erro: 'Só o admin troca a senha de um admin.' });
    const { error } = await admin.auth.admin.updateUserById(c.id, { password: c.senha });
    if (error) return json(400, { erro: `Falha ao trocar a senha: ${error.message}` });
    return json(200, { ok: true });
  }

  return json(400, { erro: 'Ação inválida.' });
});
