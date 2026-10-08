'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Curso, Turma, UC, Usuario, eGestor } from '@/lib/types';
import Login from '@/components/Login';
import NovaSenha from '@/components/NovaSenha';
import { Cadastros, CadastrosCtx } from '@/components/Contexto';
import Agenda from '@/components/Agenda';
import Painel from '@/components/Painel';
import Cursos from '@/components/Cursos';
import Turmas from '@/components/Turmas';
import Pessoas from '@/components/Pessoas';

type Aba = 'agenda' | 'painel' | 'cursos' | 'turmas' | 'pessoas';
const ABAS: { id: Aba; nome: string; gestor: boolean }[] = [
  { id: 'agenda', nome: 'Agenda', gestor: false },
  { id: 'painel', nome: 'Painel', gestor: false },
  { id: 'cursos', nome: 'Cursos', gestor: true },
  { id: 'turmas', nome: 'Turmas', gestor: true },
  { id: 'pessoas', nome: 'Pessoas', gestor: true },
];

type Dados = Omit<Cadastros, 'recarregar'>;

export default function Home() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recuperando, setRecuperando] = useState(false);
  const [dados, setDados] = useState<Dados | null | 'negado'>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('agenda');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(s);
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true);
      if (evento === 'SIGNED_OUT') setDados(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // aba pelo hash (#agenda, #painel…), para o voltar do navegador funcionar
  useEffect(() => {
    const ler = () => {
      const h = window.location.hash.slice(1) as Aba;
      if (ABAS.some((a) => a.id === h)) setAba(h);
    };
    ler();
    window.addEventListener('hashchange', ler);
    return () => window.removeEventListener('hashchange', ler);
  }, []);

  const carregar = useCallback(async () => {
    if (!session) return;
    const eu = await supabase.from('usuarios').select('*').eq('id', session.user.id).maybeSingle();
    if (eu.error) { setErro('Falha ao carregar seu perfil.'); return; }
    if (!eu.data || !eu.data.ativo) { setDados('negado'); return; }
    const [usuarios, cursos, ucs, turmas] = await Promise.all([
      supabase.from('usuarios').select('*').order('nome'),
      supabase.from('cursos').select('*').order('nome'),
      supabase.from('ucs').select('*').order('numero'),
      supabase.from('turmas').select('*').order('nome'),
    ]);
    if (usuarios.error || cursos.error || ucs.error || turmas.error) { setErro('Falha ao carregar os cadastros.'); return; }
    setErro(null);
    setDados({
      eu: eu.data as Usuario,
      usuarios: usuarios.data as Usuario[],
      cursos: cursos.data as Curso[],
      ucs: ucs.data as UC[],
      turmas: turmas.data as Turma[],
    });
  }, [session]);

  useEffect(() => { carregar(); }, [carregar]);

  const ctx = useMemo<Cadastros | null>(
    () => (dados && dados !== 'negado' ? { ...dados, recarregar: carregar } : null),
    [dados, carregar],
  );

  if (session === undefined) return <main className="centro muted">Carregando…</main>;
  if (recuperando && session) return <NovaSenha onPronto={() => setRecuperando(false)} />;
  if (!session) return <Login />;
  if (dados === 'negado') {
    return (
      <main className="centro">
        <p>Este login ainda não tem acesso. Peça à coordenação para liberar.</p>
        <button onClick={() => supabase.auth.signOut()}>Sair</button>
      </main>
    );
  }
  if (!ctx) return <main className="centro muted">{erro ?? 'Carregando…'}</main>;

  const gestor = eGestor(ctx.eu);
  const abas = ABAS.filter((a) => gestor || !a.gestor);
  const atual = abas.some((a) => a.id === aba) ? aba : 'agenda';

  return (
    <CadastrosCtx.Provider value={ctx}>
      <header className="topo">
        <div className="marca">
          <span className="marca-icone" aria-hidden="true" />
          <div>
            <h1>Agenda SENAC</h1>
            <span className="muted">Francisco Beltrão</span>
          </div>
        </div>
        <nav className="abas" aria-label="Seções">
          {abas.map((a) => (
            <a key={a.id} href={`#${a.id}`} className={`aba ${atual === a.id ? 'ativa' : ''}`}
               aria-current={atual === a.id ? 'page' : undefined}>{a.nome}</a>
          ))}
        </nav>
        <div className="usuario">
          <span className="muted">{ctx.eu.nome}</span>
          <button className="link" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>
      {erro && <p className="erro faixa">{erro}</p>}
      {atual === 'agenda' && <Agenda />}
      {atual === 'painel' && <Painel />}
      {atual === 'cursos' && <Cursos />}
      {atual === 'turmas' && <Turmas />}
      {atual === 'pessoas' && <Pessoas />}
    </CadastrosCtx.Provider>
  );
}
