'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Ocorrencia, eGestor } from '@/lib/types';
import { MESES, addDays, iso } from '@/lib/datas';
import { useCadastros } from './Contexto';
import { ProvedorDica } from './painel/Dica';
import { ItemPainel, LinhaAndamento, fmtH, pct, resumirTurmas } from './painel/dados';
import { Kpi } from './painel/Partes';
import Conflitos, { Conflito } from './painel/Conflitos';
import Andamento from './painel/Andamento';
import Fechamento from './painel/Fechamento';
import Carga from './painel/Carga';
import Preparo from './painel/Preparo';
import Matriz from './painel/Matriz';

const CAMPOS_ITEM = 'id,tipo,data,hora_inicio,hora_fim,instrutor_id,turma_id,uc_id,titulo,trabalho,material_ok,ptd_ok';
const DIAS_CONFLITO = 60;
const DIAS_PREPARO = 14;

export default function Painel() {
  const cad = useCadastros();
  const gestor = eGestor(cad.eu);
  const hoje = new Date();
  const hojeIso = iso(hoje);

  // filtros: valem para todas as seções
  const [fInstrutor, setFInstrutor] = useState(gestor ? '' : cad.eu.id);
  const [fTurma, setFTurma] = useState('');
  const [fCurso, setFCurso] = useState('');
  const [mes, setMes] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() });

  const [andamento, setAndamento] = useState<LinhaAndamento[]>([]);
  const [proximas, setProximas] = useState<ItemPainel[]>([]);
  const [conflitos, setConflitos] = useState<Conflito[]>([]);
  const [itensMes, setItensMes] = useState<ItemPainel[]>([]);
  const [conflitosMes, setConflitosMes] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);

  // dados que não dependem do mês escolhido
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true);
      const [a, p, oc] = await Promise.all([
        supabase.from('andamento').select('*'),
        supabase.from('itens').select(CAMPOS_ITEM).eq('tipo', 'aula')
          .gte('data', hojeIso).lte('data', iso(addDays(hoje, DIAS_PREPARO))).order('data').order('hora_inicio'),
        supabase.rpc('ocorrencias_periodo', { p_ini: hojeIso, p_fim: iso(addDays(hoje, DIAS_CONFLITO)) }),
      ]);
      const ocs = (oc.data ?? []) as Ocorrencia[];
      let itensConf: ItemPainel[] = [];
      if (ocs.length) {
        const r = await supabase.from('itens').select(CAMPOS_ITEM).in('id', ocs.map((o) => o.item_id));
        itensConf = (r.data ?? []) as ItemPainel[];
      }
      if (!vivo) return;
      const porId = new Map(itensConf.map((i) => [i.id, i]));
      setAndamento((a.data ?? []) as LinhaAndamento[]);
      setProximas((p.data ?? []) as ItemPainel[]);
      setConflitos(ocs.filter((o) => porId.has(o.item_id)).map((o) => ({ item: porId.get(o.item_id)!, motivo: o.motivo })));
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [hojeIso]);

  // itens e conflitos do mês da carga
  useEffect(() => {
    let vivo = true;
    const ini = iso(new Date(mes.ano, mes.mes, 1)), fim = iso(new Date(mes.ano, mes.mes + 1, 0));
    Promise.all([
      supabase.from('itens').select(CAMPOS_ITEM).gte('data', ini).lte('data', fim),
      supabase.rpc('ocorrencias_periodo', { p_ini: ini, p_fim: fim }),
    ]).then(([i, o]) => {
      if (!vivo) return;
      setItensMes((i.data ?? []) as ItemPainel[]);
      setConflitosMes(new Set(((o.data ?? []) as Ocorrencia[]).map((x) => x.item_id)));
    });
    return () => { vivo = false; };
  }, [mes]);

  const turmaPor = useMemo(() => new Map(cad.turmas.map((t) => [t.id, t])), [cad.turmas]);
  const doCurso = (turmaId: string | null) => !fCurso || (!!turmaId && turmaPor.get(turmaId)?.curso_id === fCurso);

  // turmas no escopo: ativas (ou com aulas visíveis), respeitando curso/turma/instrutor
  const resumos = useMemo(() => {
    const comAula = new Set(andamento.map((l) => l.turma_id));
    const base = cad.turmas.filter((t) => (gestor ? t.ativo || comAula.has(t.id) : comAula.has(t.id)));
    return resumirTurmas(base, cad.cursos, cad.ucs, andamento)
      .filter((r) => !fTurma || r.turma.id === fTurma)
      .filter((r) => !fCurso || r.turma.curso_id === fCurso)
      .filter((r) => !fInstrutor || r.instrutores.has(fInstrutor))
      .sort((a, b) => (a.turma.codigo ?? a.turma.nome).localeCompare(b.turma.codigo ?? b.turma.nome));
  }, [cad.turmas, cad.cursos, cad.ucs, andamento, gestor, fTurma, fCurso, fInstrutor]);
  const turmasEscopo = new Set(resumos.map((r) => r.turma.id));

  const instrutoresEscopo = cad.usuarios.filter((u) => u.leciona && u.ativo)
    .filter((u) => (fInstrutor ? u.id === fInstrutor : !(fTurma || fCurso) || resumos.some((r) => r.instrutores.has(u.id))))
    .filter((u) => gestor || u.id === cad.eu.id)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const noEscopo = (i: ItemPainel) =>
    (!fInstrutor || i.instrutor_id === fInstrutor) && (!fTurma || i.turma_id === fTurma) && doCurso(i.turma_id)
    && (gestor || i.instrutor_id === cad.eu.id);
  const conflitosF = conflitos.filter((c) => noEscopo(c.item));
  const proximasF = proximas.filter(noEscopo);
  const andamentoF = andamento.filter((l) => turmasEscopo.has(l.turma_id) && (!fInstrutor || l.instrutor_id === fInstrutor));

  // indicadores
  const tot = resumos.reduce((s, r) => ({ ch: s.ch + r.ch, ag: s.ag + r.agendado, re: s.re + r.realizado, falta: s.falta + r.aLancar }),
    { ch: 0, ag: 0, re: 0, falta: 0 });
  const semana = proximasF.filter((a) => a.data <= iso(addDays(hoje, 7))).length;
  const matOk = proximasF.filter((a) => a.material_ok).length, ptdOk = proximasF.filter((a) => a.ptd_ok).length;
  const concluidas = resumos.filter((r) => r.situacao.chave === 'concluida').length;
  const atrasadas = resumos.filter((r) => r.situacao.chave === 'atrasada').length;

  const filtrando = !!(fTurma || fCurso || (gestor && fInstrutor));
  const navegar = (k: number) => { const d = new Date(mes.ano, mes.mes + k, 1); setMes({ ano: d.getFullYear(), mes: d.getMonth() }); };
  const turmasFiltro = cad.turmas.filter((t) => (gestor ? t.ativo : andamento.some((l) => l.turma_id === t.id)))
    .filter((t) => !fCurso || t.curso_id === fCurso)
    .sort((a, b) => (a.codigo ?? a.nome).localeCompare(b.codigo ?? b.nome));

  return (
    <ProvedorDica>
      <section className={`pagina painel-pagina ${carregando ? 'carregando' : ''}`}>
        <header className="pagina-topo">
          <div>
            <h1>Painel</h1>
            <p className="muted">Visão geral de turmas, agendas e instrutores. Horas em tempo de relógio; “realizado” = aulas já terminadas.</p>
          </div>
        </header>

        {/* filtros: uma linha, fixa no topo, valem para todas as seções abaixo */}
        <div className="painel-filtros" role="group" aria-label="Filtros do painel">
          {gestor && (
            <label className="filtro-select"><span>Instrutor</span>
              <select value={fInstrutor} onChange={(e) => setFInstrutor(e.target.value)}>
                <option value="">Todos</option>
                {cad.usuarios.filter((u) => u.leciona && u.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                  .map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </label>
          )}
          <label className="filtro-select"><span>Curso</span>
            <select value={fCurso} onChange={(e) => { setFCurso(e.target.value); setFTurma(''); }}>
              <option value="">Todos</option>
              {cad.cursos.filter((c) => c.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="filtro-select"><span>Turma</span>
            <select value={fTurma} onChange={(e) => setFTurma(e.target.value)}>
              <option value="">Todas</option>
              {turmasFiltro.map((t) => <option key={t.id} value={t.id}>{t.codigo ?? t.nome}</option>)}
            </select>
          </label>
          <div className="filtro-select"><span>Mês da carga</span>
            <div className="mes pequeno">
              <button className="icone pequeno" onClick={() => navegar(-1)} aria-label="Mês anterior">‹</button>
              <strong>{MESES[mes.mes]} {mes.ano}</strong>
              <button className="icone pequeno" onClick={() => navegar(1)} aria-label="Próximo mês">›</button>
            </div>
          </div>
          {filtrando && (
            <button type="button" className="link limpar-filtros"
                    onClick={() => { setFTurma(''); setFCurso(''); if (gestor) setFInstrutor(''); }}>Limpar filtros</button>
          )}
          <nav className="painel-atalhos" aria-label="Ir para a seção">
            <a href="#conflitos">Conflitos</a><a href="#andamento">Andamento</a><a href="#fechamento">Fechamento</a>
            <a href="#carga">Carga</a><a href="#preparo">Preparo</a><a href="#matriz">Matriz</a>
          </nav>
        </div>

        <div className="kpis">
          <Kpi rotulo="Conflitos de horário" status={conflitosF.length ? 'critico' : 'bom'} href="#conflitos"
               valor={conflitosF.length} complemento={conflitosF.length ? `nos próximos ${DIAS_CONFLITO} dias` : 'nenhum à vista'} />
          <Kpi rotulo="Concluído das turmas" valor={`${pct(tot.re, tot.ch)}%`}
               complemento={`${fmtH(tot.re)} de ${fmtH(tot.ch)} · ${resumos.length} turma(s)`} />
          <Kpi rotulo="Agendado" valor={`${pct(tot.ag, tot.ch)}%`} complemento={`${fmtH(tot.ag)} lançadas na agenda`} />
          <Kpi rotulo="Falta lançar" status={tot.falta > 0 ? 'serio' : 'bom'} valor={fmtH(tot.falta)}
               complemento={tot.falta > 0 ? `para fechar ${resumos.filter((r) => r.aLancar > 0).length} turma(s)` : 'toda a CH está agendada'} />
          <Kpi rotulo="Turmas" valor={resumos.length}
               complemento={`${concluidas} concluída(s)${atrasadas ? ` · ${atrasadas} além do fim previsto` : ''}`}
               status={atrasadas ? 'critico' : undefined} />
          <Kpi rotulo="Aulas nos próximos 7 dias" valor={semana} complemento={`${proximasF.length} em ${DIAS_PREPARO} dias`} />
          <Kpi rotulo="Material pronto" status={matOk < proximasF.length ? 'serio' : 'bom'} href="#preparo"
               valor={`${pct(matOk, proximasF.length)}%`} complemento={`${matOk} de ${proximasF.length} aulas (${DIAS_PREPARO} dias)`} />
          <Kpi rotulo="PTD pronto" status={ptdOk < proximasF.length ? 'serio' : 'bom'} href="#preparo"
               valor={`${pct(ptdOk, proximasF.length)}%`} complemento={`${ptdOk} de ${proximasF.length} aulas (${DIAS_PREPARO} dias)`} />
        </div>

        <Conflitos lista={conflitosF} usuarios={cad.usuarios} turmas={cad.turmas} dias={DIAS_CONFLITO} />
        <Andamento resumos={resumos} usuarios={cad.usuarios} destaqueInstrutor={fInstrutor} />
        <Fechamento resumos={resumos} />
        <Carga instrutores={instrutoresEscopo} itens={itensMes} conflitos={conflitosMes} ano={mes.ano} mes={mes.mes} />
        <Preparo aulas={proximasF} dias={DIAS_PREPARO} usuarios={cad.usuarios} turmas={cad.turmas} ucs={cad.ucs} />
        <Matriz linhas={andamentoF} instrutores={instrutoresEscopo} turmas={resumos.map((r) => r.turma)} />
      </section>
    </ProvedorDica>
  );
}
