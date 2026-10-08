'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ITEM_CAMPOS, Item, Turno, eGestor, mensagemErro } from '@/lib/types';
import { MESES, deIso, iso, semanasDoMes } from '@/lib/datas';
import { indices, useCadastros } from './Contexto';
import Grade, { Cartao } from './Grade';
import FormItem from './FormItem';
import DetalheAula from './DetalheAula';

type Modo = 'instrutor' | 'turma';

export default function Agenda() {
  const cad = useCadastros();
  const idx = useMemo(() => indices(cad), [cad]);
  const gestor = eGestor(cad.eu);
  const hoje = new Date();

  const [modo, setModo] = useState<Modo>('instrutor');
  const [alvo, setAlvo] = useState<string>(() => {
    if (!gestor || cad.eu.leciona) return cad.eu.id;
    return cad.usuarios.find((u) => u.leciona && u.ativo)?.id ?? '';
  });
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [itens, setItens] = useState<Item[]>([]);
  const [minhasTurmas, setMinhasTurmas] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<{ data: Date; turno: Turno; item?: Item } | null>(null);
  const [detalhe, setDetalhe] = useState<Item | null>(null);

  const semanas = useMemo(() => semanasDoMes(ano, mes), [ano, mes]);

  const carregar = useCallback(async () => {
    if (!alvo) { setItens([]); return; }
    setCarregando(true);
    const q = supabase.from('itens').select(ITEM_CAMPOS)
      .gte('data', iso(semanas[0][0])).lte('data', iso(semanas[semanas.length - 1][5]));
    const { data, error } = await (modo === 'instrutor' ? q.eq('instrutor_id', alvo) : q.eq('turma_id', alvo));
    setCarregando(false);
    if (error) { setErro('Falha ao carregar a agenda.'); return; }
    setErro(null);
    setItens(data as Item[]);
  }, [alvo, modo, semanas]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    // outra pessoa pode ter editado: recarrega ao voltar para a aba
    const f = () => { if (document.visibilityState === 'visible') carregar(); };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [carregar]);

  // instrutor: turmas em que dá aula (pode ver a agenda delas)
  useEffect(() => {
    if (gestor) return;
    supabase.from('itens').select('turma_id').eq('instrutor_id', cad.eu.id).eq('tipo', 'aula').then(({ data }) => {
      setMinhasTurmas([...new Set((data ?? []).map((x) => x.turma_id as string))]);
    });
  }, [gestor, cad.eu.id]);

  function navegar(delta: number) {
    const d = new Date(ano, mes + delta, 1);
    setAno(d.getFullYear()); setMes(d.getMonth());
  }

  function descrever(i: Item): Cartao {
    if (i.tipo === 'evento') {
      return { titulo: i.titulo ?? 'Evento', sub: i.observacao, cor: i.cor ?? '#64748B', selo: i.origem === 'v0' ? 'v0' : undefined };
    }
    const t = i.turma_id ? idx.turma.get(i.turma_id) : undefined;
    const u = i.uc_id ? idx.uc.get(i.uc_id) : undefined;
    const ucTxt = u ? `UC${u.numero} · ${u.nome}` : 'UC';
    if (modo === 'turma') {
      const p = idx.usuario.get(i.instrutor_id);
      return { titulo: ucTxt, sub: i.observacao || p?.nome, cor: p?.cor ?? '#004A8D' };
    }
    return { titulo: t?.nome ?? 'Turma', sub: i.observacao || ucTxt, cor: t?.cor ?? '#004A8D' };
  }

  async function marcar(i: Item, campo: 'material' | 'ptd') {
    const valor = campo === 'material' ? !i.material_ok : !i.ptd_ok;
    setItens((l) => l.map((x) => x.id === i.id ? { ...x, [campo === 'material' ? 'material_ok' : 'ptd_ok']: valor } : x));
    const { error } = await supabase.rpc('marcar_item', { p_id: i.id, p_campo: campo, p_valor: valor });
    if (error) { setErro(mensagemErro(error, 'Não foi possível marcar.')); carregar(); }
  }

  const podeMarcar = (i: Item) => gestor || i.instrutor_id === cad.eu.id;
  const acoes = (i: Item) => (
    <>
      <button type="button" className={`marcacao ${i.material_ok ? 'ok' : ''}`} disabled={!podeMarcar(i)}
              onClick={() => marcar(i, 'material')} aria-pressed={i.material_ok}
              title={i.material_ok ? 'Material pronto' : 'Material pendente'}>
        <span aria-hidden="true">{i.material_ok ? '✓' : '○'}</span> Material
      </button>
      <button type="button" className={`marcacao ${i.ptd_ok ? 'ok' : ''}`} disabled={!podeMarcar(i)}
              onClick={() => marcar(i, 'ptd')} aria-pressed={i.ptd_ok}
              title={i.ptd_ok ? 'PTD pronto' : 'PTD pendente'}>
        <span aria-hidden="true">{i.ptd_ok ? '✓' : '○'}</span> PTD
      </button>
    </>
  );

  const instrutores = cad.usuarios.filter((u) => u.leciona && (u.ativo || u.id === alvo));
  const turmasFiltro = gestor ? cad.turmas.filter((t) => t.ativo || t.id === alvo) : cad.turmas.filter((t) => minhasTurmas.includes(t.id));

  return (
    <>
      <div className="barra">
        <div className="filtro">
          {gestor || minhasTurmas.length ? (
            <div className="opcoes" role="group" aria-label="Ver agenda por">
              <button type="button" className={`opcao ${modo === 'instrutor' ? 'ativa' : ''}`} aria-pressed={modo === 'instrutor'}
                      onClick={() => { setModo('instrutor'); setAlvo(gestor ? (instrutores[0]?.id ?? '') : cad.eu.id); }}>
                {gestor ? 'Instrutor' : 'Minha agenda'}
              </button>
              <button type="button" className={`opcao ${modo === 'turma' ? 'ativa' : ''}`} aria-pressed={modo === 'turma'}
                      onClick={() => { setModo('turma'); setAlvo(turmasFiltro[0]?.id ?? ''); }}>
                Turma
              </button>
            </div>
          ) : null}
          {modo === 'instrutor' && gestor && (
            <select value={alvo} onChange={(e) => setAlvo(e.target.value)} aria-label="Instrutor">
              {!instrutores.length && <option value="">Nenhum instrutor cadastrado</option>}
              {instrutores.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          )}
          {modo === 'turma' && (
            <select value={alvo} onChange={(e) => setAlvo(e.target.value)} aria-label="Turma">
              {!turmasFiltro.length && <option value="">Nenhuma turma</option>}
              {turmasFiltro.map((t) => <option key={t.id} value={t.id}>{t.nome}{t.codigo ? ` — ${t.codigo}` : ''}</option>)}
            </select>
          )}
        </div>
        <nav className="mes" aria-label="Mês">
          <button className="icone" onClick={() => navegar(-1)} aria-label="Mês anterior">‹</button>
          <strong>{MESES[mes]} <span className="ano">{ano}</span></strong>
          <button className="icone" onClick={() => navegar(1)} aria-label="Próximo mês">›</button>
          <button className="secundario" onClick={() => { setAno(hoje.getFullYear()); setMes(hoje.getMonth()); }}>Hoje</button>
        </nav>
      </div>
      {erro && <p className="erro faixa">{erro}</p>}
      {!alvo ? (
        <p className="muted faixa">
          {gestor ? 'Cadastre instrutores e turmas para começar a montar a agenda.' : 'Nada para mostrar ainda.'}
        </p>
      ) : (
        <main className={carregando ? 'carregando' : ''}>
          <Grade semanas={semanas} mes={mes} itens={itens} grande={!gestor} descrever={descrever}
                 acoes={acoes}
                 onItem={(i) => (gestor ? setForm({ data: deIso(i.data), turno: i.turno, item: i }) : setDetalhe(i))}
                 onCelula={gestor ? (data, turno) => setForm({ data, turno }) : undefined} />
        </main>
      )}
      {form && (
        <FormItem modo={modo} alvoId={alvo} data={form.data} turno={form.turno} item={form.item}
                  onClose={() => setForm(null)} onSaved={() => { setForm(null); carregar(); }} />
      )}
      {detalhe && <DetalheAula item={detalhe} onClose={() => setDetalhe(null)} />}
    </>
  );
}
