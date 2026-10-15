'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ITEM_CAMPOS, Item, Turno, eGestor, mensagemErro } from '@/lib/types';
import { MESES, deIso, iso, semanasDoMes } from '@/lib/datas';
import { indices, useCadastros } from './Contexto';
import Grade, { Cartao } from './Grade';
import FormItem from './FormItem';
import DetalheAula from './DetalheAula';
import Icone from './Icone';

type Modo = 'instrutor' | 'turma';

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

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
  const [busca, setBusca] = useState('');
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [itens, setItens] = useState<Item[]>([]);
  const [conflitos, setConflitos] = useState<Map<string, string>>(new Map());
  const [minhasTurmas, setMinhasTurmas] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<{ data: Date; turno: Turno; item?: Item } | null>(null);
  const [detalhe, setDetalhe] = useState<Item | null>(null);

  const semanas = useMemo(() => semanasDoMes(ano, mes), [ano, mes]);

  const carregar = useCallback(async () => {
    if (!alvo) { setItens([]); return; }
    setCarregando(true);
    const ini = iso(semanas[0][0]), fim = iso(semanas[semanas.length - 1][5]);
    const q = supabase.from('itens').select(ITEM_CAMPOS).gte('data', ini).lte('data', fim);
    const [{ data, error }, c] = await Promise.all([
      modo === 'instrutor' ? q.eq('instrutor_id', alvo) : q.eq('turma_id', alvo),
      supabase.rpc('conflitos_periodo', { p_ini: ini, p_fim: fim }),
    ]);
    setCarregando(false);
    if (error) { setErro('Falha ao carregar a agenda.'); return; }
    setErro(null);
    setItens(data as Item[]);
    setConflitos(new Map(((c.data ?? []) as { item_id: string; motivo: string }[]).map((x) => [x.item_id, x.motivo])));
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
    return { ...cartaoBase(i), alerta: conflitos.get(i.id) ?? null };
  }

  function cartaoBase(i: Item): Cartao {
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

  // listas do painel de filtro (direita)
  const instrutores = cad.usuarios.filter((u) => u.leciona && u.ativo)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const turmas = (gestor ? cad.turmas.filter((t) => t.ativo) : cad.turmas.filter((t) => minhasTurmas.includes(t.id)))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const q = normal(busca.trim());
  const lista = modo === 'instrutor'
    ? instrutores.filter((u) => !q || normal(u.nome).includes(q))
        .map((u) => ({ id: u.id, nome: u.nome, sub: u.id === cad.eu.id ? 'Você' : null, cor: u.cor }))
    : turmas.filter((t) => !q || normal(`${t.nome} ${t.codigo ?? ''} ${idx.curso.get(t.curso_id)?.nome ?? ''}`).includes(q))
        .map((t) => ({ id: t.id, nome: t.nome, sub: [t.codigo, idx.curso.get(t.curso_id)?.nome].filter(Boolean).join(' · '), cor: t.cor }));

  function trocarModo(m: Modo) {
    if (m === modo) return;
    setModo(m);
    setBusca('');
    setAlvo(m === 'instrutor' ? (gestor ? (cad.eu.leciona ? cad.eu.id : instrutores[0]?.id ?? '') : cad.eu.id) : (turmas[0]?.id ?? ''));
  }

  const nomeAlvo = modo === 'instrutor' ? idx.usuario.get(alvo)?.nome : idx.turma.get(alvo)?.nome;
  const corAlvo = modo === 'instrutor' ? idx.usuario.get(alvo)?.cor : idx.turma.get(alvo)?.cor;
  const mostrarFiltro = gestor || minhasTurmas.length > 0;

  return (
    <div className={`agenda-layout ${mostrarFiltro ? '' : 'sem-filtro'}`}>
      <section className="agenda-principal">
        <div className="agenda-topo">
          <div className="agenda-titulo">
            {corAlvo && <span className="bolinha-inline grande" style={{ background: corAlvo }} />}
            <div>
              <span className="muted pequeno">{modo === 'instrutor' ? (alvo === cad.eu.id ? 'Minha agenda' : 'Agenda do instrutor') : 'Agenda da turma'}</span>
              <h1>{nomeAlvo ?? '—'}</h1>
            </div>
          </div>
          <nav className="mes" aria-label="Mês">
            <button className="icone" onClick={() => navegar(-1)} aria-label="Mês anterior">‹</button>
            <strong>{MESES[mes]} <span className="ano">{ano}</span></strong>
            <button className="icone" onClick={() => navegar(1)} aria-label="Próximo mês">›</button>
            <button className="secundario" onClick={() => { setAno(hoje.getFullYear()); setMes(hoje.getMonth()); }}>Hoje</button>
          </nav>
        </div>
        {erro && <p className="erro">{erro}</p>}
        {!alvo ? (
          <p className="muted vazio">
            {gestor ? 'Cadastre instrutores e turmas para começar a montar a agenda.' : 'Nada para mostrar ainda.'}
          </p>
        ) : (
          <div className={carregando ? 'carregando' : ''}>
            <Grade semanas={semanas} mes={mes} itens={itens} grande={!gestor} descrever={descrever}
                   acoes={acoes}
                   onItem={(i) => (gestor ? setForm({ data: deIso(i.data), turno: i.turno, item: i }) : setDetalhe(i))}
                   onCelula={gestor ? (data, turno) => setForm({ data, turno }) : undefined} />
          </div>
        )}
      </section>

      {mostrarFiltro && (
        <aside className="filtro-lateral" aria-label="Escolher agenda">
          <div className="segmentado" role="tablist" aria-label="Ver agenda por">
            <button type="button" role="tab" aria-selected={modo === 'instrutor'} className={modo === 'instrutor' ? 'ativo' : ''}
                    onClick={() => trocarModo('instrutor')}>{gestor ? 'Instrutores' : 'Minha agenda'}</button>
            <button type="button" role="tab" aria-selected={modo === 'turma'} className={modo === 'turma' ? 'ativo' : ''}
                    onClick={() => trocarModo('turma')}>Turmas</button>
          </div>
          {(gestor || modo === 'turma') && (
            <label className="busca">
              <Icone nome="busca" tamanho={16} />
              <input value={busca} onChange={(e) => setBusca(e.target.value)}
                     placeholder={modo === 'instrutor' ? 'Buscar instrutor' : 'Buscar turma ou código'} aria-label="Buscar" />
            </label>
          )}
          {(gestor || modo === 'turma') && (
            <ul className="filtro-lista" role="listbox" aria-label={modo === 'instrutor' ? 'Instrutores' : 'Turmas'}>
              {lista.map((x) => (
                <li key={x.id}>
                  <button type="button" role="option" aria-selected={alvo === x.id}
                          className={`filtro-item ${alvo === x.id ? 'ativo' : ''}`} onClick={() => setAlvo(x.id)}>
                    <span className="bolinha-inline" style={{ background: x.cor }} />
                    <span className="filtro-texto">
                      <span>{x.nome}</span>
                      {x.sub && <small>{x.sub}</small>}
                    </span>
                  </button>
                </li>
              ))}
              {!lista.length && (
                <li className="muted pequeno filtro-vazio">
                  {busca ? 'Nada encontrado.' : modo === 'instrutor' ? 'Nenhum instrutor cadastrado.' : 'Nenhuma turma cadastrada.'}
                </li>
              )}
            </ul>
          )}
          {!gestor && modo === 'instrutor' && <p className="muted pequeno">Mostrando a sua agenda. Em “Turmas” você vê a agenda das turmas em que dá aula.</p>}
        </aside>
      )}

      {form && (
        <FormItem modo={modo} alvoId={alvo} data={form.data} turno={form.turno} item={form.item}
                  onClose={() => setForm(null)} onSaved={() => { setForm(null); carregar(); }} />
      )}
      {detalhe && <DetalheAula item={detalhe} alerta={conflitos.get(detalhe.id)} onClose={() => setDetalhe(null)} />}
    </div>
  );
}
