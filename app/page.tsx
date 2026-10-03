'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Compromisso, Registro, Turno } from '@/lib/types';
import { MESES, iso, semanasDoMes } from '@/lib/datas';
import Login from '@/components/Login';
import NovaSenha from '@/components/NovaSenha';
import Grade from '@/components/Grade';
import Editor from '@/components/Editor';

type Acesso = 'verificando' | 'ok' | 'negado';

export default function Home() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recuperando, setRecuperando] = useState(false);
  const [acesso, setAcesso] = useState<Acesso>('verificando');
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [compromissos, setCompromissos] = useState<Compromisso[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<{ data: Date; turno: Turno; registro: Registro | null } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(s);
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const semanas = useMemo(() => semanasDoMes(ano, mes), [ano, mes]);

  const carregarCatalogo = useCallback(async () => {
    // RLS: só quem está na tabela editores enxerga alguma linha
    const ed = await supabase.from('editores').select('email').limit(1);
    if (ed.error || !ed.data?.length) { setAcesso('negado'); return; }
    const { data, error } = await supabase.from('compromissos').select('*').order('nome');
    if (error) { setErro('Falha ao carregar a lista de compromissos.'); return; }
    setCompromissos(data as Compromisso[]);
    setAcesso('ok');
  }, []);

  const carregarAgenda = useCallback(async () => {
    const ini = iso(semanas[0][0]);
    const fim = iso(semanas[semanas.length - 1][5]);
    setCarregando(true);
    const { data, error } = await supabase.from('agenda')
      .select('id,data,turno,compromisso_id,hora_inicio,hora_fim,observacao,gcal_event_id,updated_at')
      .gte('data', ini).lte('data', fim);
    setCarregando(false);
    if (error) { setErro('Falha ao carregar a agenda.'); return; }
    setErro(null);
    setRegistros(data as Registro[]);
  }, [semanas]);

  useEffect(() => { if (session) carregarCatalogo(); }, [session, carregarCatalogo]);
  useEffect(() => { if (session && acesso === 'ok') carregarAgenda(); }, [session, acesso, carregarAgenda]);
  useEffect(() => {
    // outra coordenadora pode ter editado: recarrega ao voltar para a aba
    const f = () => { if (document.visibilityState === 'visible' && session && acesso === 'ok') carregarAgenda(); };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [session, acesso, carregarAgenda]);

  const mapaReg = useMemo(() => new Map(registros.map((r) => [`${r.data}|${r.turno}`, r])), [registros]);
  const mapaComp = useMemo(() => new Map(compromissos.map((c) => [c.id, c])), [compromissos]);

  function navegar(delta: number) {
    const d = new Date(ano, mes + delta, 1);
    setAno(d.getFullYear()); setMes(d.getMonth());
  }

  if (session === undefined) return <main className="centro muted">Carregando…</main>;
  if (recuperando && session) return <NovaSenha onPronto={() => setRecuperando(false)} />;
  if (!session) return <Login />;
  if (acesso === 'negado') {
    return (
      <main className="centro">
        <p>Este login ainda não tem acesso à agenda.</p>
        <button onClick={() => supabase.auth.signOut()}>Sair</button>
      </main>
    );
  }

  return (
    <>
      <header className="topo">
        <div className="marca">
          <span className="marca-icone" aria-hidden="true" />
          <div>
            <h1>Agenda Bryam</h1>
            <span className="muted">SENAC Francisco Beltrão</span>
          </div>
        </div>
        <nav className="mes" aria-label="Mês">
          <button className="icone" onClick={() => navegar(-1)} aria-label="Mês anterior">‹</button>
          <strong>{MESES[mes]} <span className="ano">{ano}</span></strong>
          <button className="icone" onClick={() => navegar(1)} aria-label="Próximo mês">›</button>
          <button className="secundario" onClick={() => { setAno(hoje.getFullYear()); setMes(hoje.getMonth()); }}>Hoje</button>
        </nav>
        <div className="usuario">
          <span className="muted">{session.user.email}</span>
          <button className="link" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>
      {erro && <p className="erro faixa">{erro}</p>}
      <main className={carregando ? 'carregando' : ''}>
        <Grade semanas={semanas} mes={mes} registros={mapaReg} compromissos={mapaComp}
               onCelula={(data, turno, registro) => setEdicao({ data, turno, registro })} />
      </main>
      {edicao && (
        <Editor {...edicao} compromissos={compromissos}
                onClose={() => setEdicao(null)}
                onSaved={() => { setEdicao(null); carregarAgenda(); }}
                onCatalogoMudou={carregarCatalogo} />
      )}
    </>
  );
}
