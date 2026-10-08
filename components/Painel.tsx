'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Progresso, eGestor, fmtHoras, fmtMin, minutos } from '@/lib/types';
import { MESES, addDays, ddmm, deIso, hhmm, iso, segundaDaSemana } from '@/lib/datas';
import { indices, useCadastros } from './Contexto';

interface ItemCarga { instrutor_id: string; data: string; hora_inicio: string; hora_fim: string; tipo: string; trabalho: boolean }
interface Pendencia { id: string; data: string; hora_inicio: string; instrutor_id: string; turma_id: string; uc_id: string; material_ok: boolean; ptd_ok: boolean }

/** Barra empilhada: realizado (cheio) + agendado futuro (claro) sobre o total. */
function Barra({ realizado, agendado, total, cor }: { realizado: number; agendado: number; total: number; cor: string }) {
  const max = Math.max(total, agendado, 0.0001);
  const pr = (realizado / max) * 100, pa = (Math.max(agendado - realizado, 0) / max) * 100;
  return (
    <div className="barra-ch" style={{ '--c': cor } as React.CSSProperties} role="img"
         aria-label={`Realizado ${fmtHoras(realizado)}, agendado ${fmtHoras(agendado)} de ${fmtHoras(total)}`}>
      <span className="real" style={{ width: `${pr}%` }} />
      <span className="agend" style={{ width: `${pa}%` }} />
      {agendado > total && <span className="excesso" style={{ left: `${(total / max) * 100}%` }} />}
    </div>
  );
}

export default function Painel() {
  const cad = useCadastros();
  const idx = useMemo(() => indices(cad), [cad]);
  const gestor = eGestor(cad.eu);
  const hoje = new Date();
  const [progresso, setProgresso] = useState<Progresso[]>([]);
  const [turmaSel, setTurmaSel] = useState<string>('');
  const [mes, setMes] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() });
  const [carga, setCarga] = useState<ItemCarga[]>([]);
  const [pend, setPend] = useState<Pendencia[]>([]);

  useEffect(() => {
    supabase.from('progresso').select('*').then(({ data }) => setProgresso((data ?? []) as Progresso[]));
    supabase.from('itens').select('id,data,hora_inicio,instrutor_id,turma_id,uc_id,material_ok,ptd_ok')
      .eq('tipo', 'aula').gte('data', iso(hoje)).lte('data', iso(addDays(hoje, 14)))
      .or('material_ok.eq.false,ptd_ok.eq.false').order('data').order('hora_inicio')
      .then(({ data }) => setPend(((data ?? []) as Pendencia[]).filter((p) => gestor || p.instrutor_id === cad.eu.id)));
  }, [gestor, cad.eu.id]);

  useEffect(() => {
    const ini = new Date(mes.ano, mes.mes, 1), fim = new Date(mes.ano, mes.mes + 1, 0);
    let q = supabase.from('itens').select('instrutor_id,data,hora_inicio,hora_fim,tipo,trabalho')
      .gte('data', iso(ini)).lte('data', iso(fim));
    if (!gestor) q = q.eq('instrutor_id', cad.eu.id);
    q.then(({ data }) => setCarga((data ?? []) as ItemCarga[]));
  }, [mes, gestor, cad.eu.id]);

  // turmas visíveis: gestor vê todas as ativas; instrutor, as que aparecem no progresso (RLS)
  const turmas = useMemo(() => {
    const comAula = new Set(progresso.map((p) => p.turma_id));
    return cad.turmas.filter((t) => (gestor ? t.ativo || comAula.has(t.id) : comAula.has(t.id)))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [cad.turmas, progresso, gestor]);
  useEffect(() => { if (!turmaSel && turmas.length) setTurmaSel(turmas[0].id); }, [turmas, turmaSel]);

  const resumoTurma = (turmaId: string) => {
    const t = idx.turma.get(turmaId)!;
    const ucs = cad.ucs.filter((u) => u.curso_id === t.curso_id).sort((a, b) => a.numero - b.numero);
    const linhas = ucs.map((u) => {
      const p = progresso.find((x) => x.turma_id === turmaId && x.uc_id === u.id);
      return { uc: u, ch: Number(u.ch), agendado: Number(p?.horas_agendadas ?? 0), realizado: Number(p?.horas_realizadas ?? 0) };
    });
    const tot = linhas.reduce((s, l) => ({ ch: s.ch + l.ch, agendado: s.agendado + l.agendado, realizado: s.realizado + l.realizado }), { ch: 0, agendado: 0, realizado: 0 });
    return { turma: t, linhas, tot };
  };
  const sel = turmaSel && idx.turma.has(turmaSel) ? resumoTurma(turmaSel) : null;

  // carga do mês por instrutor
  const porInstrutor = useMemo(() => {
    const m = new Map<string, { trabalho: number; aulas: number; eventos: number; dias: Map<string, number>; semanas: Map<string, number> }>();
    for (const i of carga) {
      const r = m.get(i.instrutor_id) ?? { trabalho: 0, aulas: 0, eventos: 0, dias: new Map(), semanas: new Map() };
      const min = minutos(i.hora_inicio, i.hora_fim);
      if (i.tipo === 'aula') r.aulas += min; else if (i.trabalho) r.eventos += min;
      if (i.trabalho) {
        r.trabalho += min;
        r.dias.set(i.data, (r.dias.get(i.data) ?? 0) + min);
        const sem = iso(segundaDaSemana(deIso(i.data)));
        r.semanas.set(sem, (r.semanas.get(sem) ?? 0) + min);
      }
      m.set(i.instrutor_id, r);
    }
    return [...m.entries()].map(([id, r]) => ({ id, ...r })).sort((a, b) => b.trabalho - a.trabalho);
  }, [carga]);
  const maxSemana = Math.max(1, ...porInstrutor.flatMap((r) => [...r.semanas.values()]));

  function navegar(k: number) {
    const d = new Date(mes.ano, mes.mes + k, 1);
    setMes({ ano: d.getFullYear(), mes: d.getMonth() });
  }

  return (
    <section className="pagina">
      <header className="pagina-topo">
        <div>
          <h2>Painel</h2>
          <p className="muted">Andamento das UCs e carga horária dos instrutores. Horas em tempo de relógio.</p>
        </div>
      </header>

      <div className="paineis">
        <article className="painel">
          <div className="secao-topo">
            <h3>Andamento da turma</h3>
            <select value={turmaSel} onChange={(e) => setTurmaSel(e.target.value)} aria-label="Turma">
              {!turmas.length && <option value="">Nenhuma turma</option>}
              {turmas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
          {sel && (
            <>
              <div className="total-turma">
                <Barra realizado={sel.tot.realizado} agendado={sel.tot.agendado} total={sel.tot.ch} cor={sel.turma.cor} />
                <p className="muted">
                  Realizado <strong>{fmtHoras(sel.tot.realizado)}</strong> · agendado {fmtHoras(sel.tot.agendado)} de {fmtHoras(sel.tot.ch)}
                  {' '}({sel.tot.ch ? Math.round((sel.tot.realizado / sel.tot.ch) * 100) : 0}% concluído)
                  {sel.tot.ch > sel.tot.agendado && ` · faltam lançar ${fmtHoras(sel.tot.ch - sel.tot.agendado)}`}
                </p>
              </div>
              <ul className="lista-ch">
                {sel.linhas.map((l) => (
                  <li key={l.uc.id}>
                    <div className="lista-ch-topo">
                      <span><strong>UC{l.uc.numero}</strong> {l.uc.nome}</span>
                      <span className={l.agendado > l.ch ? 'erro' : 'muted'}>
                        {fmtHoras(l.realizado)} / {fmtHoras(l.agendado)} / {fmtHoras(l.ch)}
                      </span>
                    </div>
                    <Barra realizado={l.realizado} agendado={l.agendado} total={l.ch} cor={sel.turma.cor} />
                    <span className="muted pequeno">
                      {l.agendado >= l.ch ? (l.agendado > l.ch ? `passou ${fmtHoras(l.agendado - l.ch)} da CH` : 'CH toda agendada')
                        : `faltam lançar ${fmtHoras(l.ch - l.agendado)}`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="legenda"><i className="real" /> realizado <i className="agend" /> agendado <i className="falta" /> a lançar</p>
            </>
          )}
        </article>

        <article className="painel">
          <div className="secao-topo">
            <h3>Carga dos instrutores</h3>
            <div className="mes pequeno">
              <button className="icone pequeno" onClick={() => navegar(-1)} aria-label="Mês anterior">‹</button>
              <strong>{MESES[mes.mes]} {mes.ano}</strong>
              <button className="icone pequeno" onClick={() => navegar(1)} aria-label="Próximo mês">›</button>
            </div>
          </div>
          {!porInstrutor.length && <p className="muted">Nada lançado neste mês.</p>}
          {porInstrutor.map((r) => {
            const u = idx.usuario.get(r.id);
            const diasCheios = [...r.dias.values()].filter((m) => m >= 9 * 60).length;
            return (
              <div key={r.id} className="carga">
                <div className="lista-ch-topo">
                  <span><span className="bolinha-inline" style={{ background: u?.cor }} /> <strong>{u?.nome ?? '—'}</strong></span>
                  <span><strong>{fmtMin(r.trabalho)}</strong> <span className="muted">no mês</span></span>
                </div>
                <p className="muted pequeno">
                  Aulas {fmtMin(r.aulas)} · eventos {fmtMin(r.eventos)} · {r.dias.size} dias com trabalho
                  {diasCheios > 0 && <span className="erro"> · {diasCheios} dia(s) com 9 h ou mais</span>}
                </p>
                <div className="semanas-ch">
                  {[...r.semanas.entries()].sort().map(([sem, min]) => (
                    <div key={sem} className="semana-ch" title={`Semana de ${ddmm(deIso(sem))}: ${fmtMin(min)}`}>
                      <span style={{ height: `${(min / maxSemana) * 100}%`, background: u?.cor }} />
                      <small>{ddmm(deIso(sem))}</small>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </article>

        <article className="painel">
          <h3>Material e PTD pendentes <span className="muted pequeno">(próximos 14 dias)</span></h3>
          {!pend.length && <p className="muted">Nenhuma pendência. 🎉</p>}
          <ul className="pendencias">
            {pend.slice(0, 40).map((p) => {
              const t = idx.turma.get(p.turma_id), uc = idx.uc.get(p.uc_id), u = idx.usuario.get(p.instrutor_id);
              return (
                <li key={p.id}>
                  <span><strong>{ddmm(deIso(p.data))}</strong> {hhmm(p.hora_inicio)} · {t?.nome} · UC{uc?.numero}{gestor && ` · ${u?.nome}`}</span>
                  <span>
                    {!p.material_ok && <span className="selo-item">material</span>}
                    {!p.ptd_ok && <span className="selo-item">PTD</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          {pend.length > 40 && <p className="muted">e mais {pend.length - 40}…</p>}
        </article>
      </div>
    </section>
  );
}
