'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { COR_NEUTRA, Ocorrencia, eGestor } from '@/lib/types';
import { MESES, iso, semanasDoMes } from '@/lib/datas';
import { indices, useCadastros } from './Contexto';
import AgendaColuna, { Modo, PainelAgenda, descreverAgenda } from './AgendaColuna';
import { normal } from './Filtros';
import Icone from './Icone';

const MAX_AGENDAS = 2;

export default function Agenda() {
  const cad = useCadastros();
  const idx = useMemo(() => indices(cad), [cad]);
  const gestor = eGestor(cad.eu);
  const hoje = new Date();

  const alvoInicial = !gestor || cad.eu.leciona ? cad.eu.id : cad.usuarios.find((u) => u.leciona && u.ativo)?.id ?? '';
  const [paineis, setPaineis] = useState<PainelAgenda[]>([{ id: 1, modo: 'instrutor', alvo: alvoInicial }]);
  const [ativo, setAtivo] = useState(0);
  const [filtroModo, setFiltroModo] = useState<Modo>('instrutor');
  const [busca, setBusca] = useState('');
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [versao, setVersao] = useState(0);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [minhasTurmas, setMinhasTurmas] = useState<string[]>([]);

  const semanas = useMemo(() => semanasDoMes(ano, mes), [ano, mes]);
  const comparando = paineis.length > 1;

  // conflitos já gravados no período visível: cartões e nomes do filtro em vermelho
  const carregarOcorrencias = useCallback(async () => {
    const { data } = await supabase.rpc('ocorrencias_periodo', {
      p_ini: iso(semanas[0][0]), p_fim: iso(semanas[semanas.length - 1][5]),
    });
    setOcorrencias((data ?? []) as Ocorrencia[]);
  }, [semanas]);
  useEffect(() => { carregarOcorrencias(); }, [carregarOcorrencias, versao]);

  // outra pessoa pode ter editado: recarrega tudo ao voltar para a aba
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'visible') setVersao((v) => v + 1); };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);

  // instrutor: turmas em que dá aula (pode ver a agenda delas)
  useEffect(() => {
    if (gestor) return;
    supabase.from('itens').select('turma_id').eq('instrutor_id', cad.eu.id).eq('tipo', 'aula').then(({ data }) => {
      setMinhasTurmas([...new Set((data ?? []).map((x) => x.turma_id as string))]);
    });
  }, [gestor, cad.eu.id]);

  const porItem = useMemo(() => new Map(ocorrencias.map((o) => [o.item_id, o.motivo])), [ocorrencias]);
  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of ocorrencias) {
      m.set(o.instrutor_id, (m.get(o.instrutor_id) ?? 0) + 1);
      if (o.turma_id) m.set(o.turma_id, (m.get(o.turma_id) ?? 0) + 1);
      if (o.local_id) m.set(o.local_id, (m.get(o.local_id) ?? 0) + 1);
    }
    return m;
  }, [ocorrencias]);

  function navegar(delta: number) {
    const d = new Date(ano, mes + delta, 1);
    setAno(d.getFullYear()); setMes(d.getMonth());
  }

  function ativar(i: number) {
    if (i === ativo) return;
    setAtivo(i);
    setFiltroModo(paineis[i].modo);
    setBusca('');
  }
  function escolher(id: string) {
    setPaineis((ps) => ps.map((p, i) => (i === ativo ? { ...p, modo: filtroModo, alvo: id } : p)));
  }
  function adicionar() {
    if (paineis.length >= MAX_AGENDAS) return;
    const novo = { id: Math.max(...paineis.map((p) => p.id)) + 1, modo: filtroModo, alvo: '' };
    setPaineis((ps) => [...ps, novo]);
    setAtivo(paineis.length);
  }
  function fechar(i: number) {
    const resto = paineis.filter((_, j) => j !== i);
    setPaineis(resto);
    setAtivo(0);
    setFiltroModo(resto[0]?.modo ?? 'instrutor');
  }

  // listas do filtro (direita)
  const instrutores = (gestor ? cad.usuarios.filter((u) => u.leciona && u.ativo) : cad.usuarios.filter((u) => u.id === cad.eu.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const turmas = (gestor ? cad.turmas.filter((t) => t.ativo) : cad.turmas.filter((t) => minhasTurmas.includes(t.id)))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const q = normal(busca.trim());
  const lista = filtroModo === 'instrutor'
    ? instrutores.filter((u) => !q || normal(u.nome).includes(q))
        .map((u) => ({ id: u.id, nome: u.nome, sub: u.id === cad.eu.id ? 'Você' : null, cor: u.cor }))
    : filtroModo === 'local'
    ? cad.locais.filter((l) => l.ativo && (!q || normal(l.nome).includes(q)))
        .map((l) => ({ id: l.id, nome: l.nome, sub: null, cor: COR_NEUTRA }))
    : turmas.filter((t) => !q || normal(`${t.nome} ${t.codigo ?? ''} ${idx.curso.get(t.curso_id)?.nome ?? ''}`).includes(q))
        .map((t) => ({ id: t.id, nome: t.codigo ?? t.nome, sub: idx.curso.get(t.curso_id)?.nome ?? null, cor: t.cor }));
  const comOcorrencia = lista.filter((x) => contagem.get(x.id)).length;

  const p0 = paineis[0];
  const { nome: nome0, cor: cor0, rotulo: rotulo0 } = descreverAgenda(p0.modo, p0.alvo, idx, cad.eu.id);
  // o instrutor sempre tem o filtro: pelo menos os locais (vê a agenda de qualquer sala)
  const mostrarFiltro = gestor || minhasTurmas.length > 0 || comparando || cad.locais.length > 0;

  return (
    <div className={`agenda-layout ${mostrarFiltro ? '' : 'sem-filtro'} ${comparando ? 'comparando' : ''}`}>
      <section className="agenda-principal">
        <div className="agenda-topo">
          <div className="agenda-titulo">
            {!comparando && cor0 && <span className="bolinha-inline grande" style={{ background: cor0 }} />}
            <div>
              <span className="muted pequeno">{comparando ? `${paineis.length} agendas lado a lado` : rotulo0}</span>
              <h1>{comparando ? 'Comparar agendas' : nome0 ?? '—'}</h1>
            </div>
          </div>
          <nav className="mes" aria-label="Mês">
            <button className="icone" onClick={() => navegar(-1)} aria-label="Mês anterior">‹</button>
            <strong>{MESES[mes]} <span className="ano">{ano}</span></strong>
            <button className="icone" onClick={() => navegar(1)} aria-label="Próximo mês">›</button>
            <button className="secundario" onClick={() => { setAno(hoje.getFullYear()); setMes(hoje.getMonth()); }}>Hoje</button>
          </nav>
        </div>
        <div className="agenda-colunas">
          {paineis.map((p, i) => (
            <AgendaColuna key={p.id} painel={p} numero={i + 1} ativo={comparando && i === ativo} comparando={comparando}
                          semanas={semanas} mes={mes} versao={versao} ocorrencias={porItem}
                          onAtivar={() => ativar(i)} onFechar={comparando ? () => fechar(i) : undefined}
                          onAlterou={() => setVersao((v) => v + 1)} />
          ))}
        </div>
      </section>

      {mostrarFiltro && (
        <aside className="filtro-lateral" aria-label="Escolher agenda">
          {comparando && (
            <p className="filtro-destino">
              <span className="filtro-destino-linha">Agenda ativa <span className="coluna-numero">{ativo + 1}</span></span>
              <span className="muted pequeno">O que você escolher abaixo vai para ela. Clique na outra agenda para trocar.</span>
            </p>
          )}
          <div className="segmentado" role="tablist" aria-label="Ver agenda por">
            <button type="button" role="tab" aria-selected={filtroModo === 'instrutor'} className={filtroModo === 'instrutor' ? 'ativo' : ''}
                    onClick={() => { setFiltroModo('instrutor'); setBusca(''); }}>{gestor ? 'Instrutores' : 'Minha agenda'}</button>
            <button type="button" role="tab" aria-selected={filtroModo === 'turma'} className={filtroModo === 'turma' ? 'ativo' : ''}
                    onClick={() => { setFiltroModo('turma'); setBusca(''); }}>Turmas</button>
            <button type="button" role="tab" aria-selected={filtroModo === 'local'} className={filtroModo === 'local' ? 'ativo' : ''}
                    onClick={() => { setFiltroModo('local'); setBusca(''); }}>Locais</button>
          </div>
          {(gestor || filtroModo !== 'instrutor') && (
            <label className="busca">
              <Icone nome="busca" tamanho={16} />
              <input value={busca} onChange={(e) => setBusca(e.target.value)}
                     placeholder={filtroModo === 'instrutor' ? 'Buscar instrutor' : filtroModo === 'local' ? 'Buscar local' : 'Buscar turma ou código'} aria-label="Buscar" />
            </label>
          )}
          <ul className="filtro-lista" role="listbox" aria-label={filtroModo === 'instrutor' ? 'Instrutores' : filtroModo === 'local' ? 'Locais' : 'Turmas'}>
            {lista.map((x) => {
              const naAgenda = paineis.map((p, i) => (p.modo === filtroModo && p.alvo === x.id ? i + 1 : 0)).filter(Boolean);
              const oc = contagem.get(x.id) ?? 0;
              const selecionado = paineis[ativo]?.modo === filtroModo && paineis[ativo]?.alvo === x.id;
              return (
                <li key={x.id}>
                  <button type="button" role="option" aria-selected={selecionado}
                          className={`filtro-item ${selecionado ? 'ativo' : ''} ${oc ? 'com-ocorrencia' : ''}`}
                          onClick={() => escolher(x.id)}
                          title={oc ? `${oc} ${oc === 1 ? 'item com conflito' : 'itens com conflito'} de horário neste período` : undefined}>
                    <span className="bolinha-inline" style={{ background: x.cor }} />
                    <span className="filtro-texto">
                      <span>{x.nome}</span>
                      {x.sub && <small>{x.sub}</small>}
                    </span>
                    {oc > 0 && <span className="ocorrencia-qtd" aria-label={`${oc} com conflito`}>⚠ {oc}</span>}
                    {comparando && naAgenda.map((n) => <span key={n} className="coluna-numero mini">{n}</span>)}
                  </button>
                </li>
              );
            })}
            {!lista.length && (
              <li className="muted pequeno filtro-vazio">
                {busca ? 'Nada encontrado.' : filtroModo === 'instrutor' ? 'Nenhum instrutor cadastrado.'
                  : filtroModo === 'local' ? 'Nenhum local cadastrado.' : 'Nenhuma turma.'}
              </li>
            )}
          </ul>
          {comOcorrencia > 0 && (
            <p className="filtro-aviso">
              ⚠ Em vermelho: {comOcorrencia} {filtroModo === 'instrutor' ? 'instrutor(es)' : filtroModo === 'local' ? 'local(is)' : 'turma(s)'} com conflito de horário em {MESES[mes].toLowerCase()}.
            </p>
          )}
        </aside>
      )}

      {paineis.length < MAX_AGENDAS && (
        <button type="button" className="fab" onClick={adicionar} title="Abrir outra agenda ao lado para comparar"
                aria-label="Abrir outra agenda ao lado para comparar">
          <span aria-hidden="true">+</span>
        </button>
      )}
    </div>
  );
}
