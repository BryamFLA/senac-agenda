'use client';
import { useEffect, useState } from 'react';
import { ddmm, deIso } from '@/lib/datas';
import type { Usuario } from '@/lib/types';
import { ROTULO_UC, ResumoTurma, fmtH, pct } from './dados';
import { LegendaCarga, Medidor, Secao, Selo } from './Partes';

const dt = (s: string | null) => (s ? `${ddmm(deIso(s))}/${s.slice(2, 4)}` : '—');

export default function Andamento({ resumos, usuarios, destaqueInstrutor }: {
  resumos: ResumoTurma[]; usuarios: Usuario[]; destaqueInstrutor: string;
}) {
  const us = new Map(usuarios.map((u) => [u.id, u]));
  const [sel, setSel] = useState<string>(resumos[0]?.turma.id ?? '');
  useEffect(() => {
    if (!resumos.some((r) => r.turma.id === sel)) setSel(resumos[0]?.turma.id ?? '');
  }, [resumos, sel]);
  const atual = resumos.find((r) => r.turma.id === sel);

  const tabela = (
    <table className="tabela">
      <thead><tr><th>Turma</th><th>Curso</th><th>CH</th><th>Realizado</th><th>Agendado</th><th>Falta lançar</th><th>Próxima aula</th><th>Situação</th></tr></thead>
      <tbody>
        {resumos.map((r) => (
          <tr key={r.turma.id}>
            <td>{r.turma.codigo ?? r.turma.nome}</td><td>{r.curso?.nome}</td><td className="num">{fmtH(r.ch)}</td>
            <td className="num">{fmtH(r.realizado)} ({pct(r.realizado, r.ch)}%)</td><td className="num">{fmtH(r.agendado)} ({pct(r.agendado, r.ch)}%)</td>
            <td className="num">{fmtH(r.aLancar)}</td><td>{dt(r.proxima)}</td><td>{r.situacao.texto}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Secao id="andamento" titulo="Andamento das turmas"
           sub="Carga horária realizada e agendada de cada turma. Clique numa turma para ver as UCs." tabela={tabela}>
      {!resumos.length ? <p className="muted vazio">Nenhuma turma para o filtro escolhido.</p> : (
        <>
          <LegendaCarga />
          <div className="turmas-grade">
            {resumos.map((r) => (
              <button key={r.turma.id} type="button" className={`turma-cartao ${sel === r.turma.id ? 'sel' : ''}`}
                      style={{ '--c': r.turma.cor } as React.CSSProperties} onClick={() => setSel(r.turma.id)} aria-pressed={sel === r.turma.id}>
                <span className="turma-cartao-topo">
                  <span>
                    <strong>{r.turma.codigo ?? r.turma.nome}</strong>
                    <small>{r.curso?.nome}</small>
                  </span>
                  <span className="turma-pct">{pct(r.realizado, r.ch)}<small>%</small></span>
                </span>
                <Medidor realizado={r.realizado} agendado={r.agendado} total={r.ch} titulo={r.turma.codigo ?? r.turma.nome} />
                <span className="turma-numeros">
                  <span><b>{fmtH(r.realizado)}</b> realizadas</span>
                  <span><b>{fmtH(r.agendado)}</b> agendadas</span>
                  <span><b>{fmtH(r.ch)}</b> no curso</span>
                </span>
                <span className="turma-rodape">
                  <Selo status={r.situacao.status}>{r.situacao.texto}</Selo>
                  <span className="muted">{r.proxima ? `próxima aula ${dt(r.proxima)}` : r.ultima ? `última aula ${dt(r.ultima)}` : ''}</span>
                </span>
              </button>
            ))}
          </div>

          {atual && (
            <div className="ucs-detalhe">
              <div className="ucs-detalhe-topo">
                <h3>UCs de {atual.turma.codigo ?? atual.turma.nome}</h3>
                <span className="muted">
                  {atual.ucs.filter((u) => u.situacao === 'concluida').length} de {atual.ucs.length} UCs concluídas ·
                  {' '}{atual.futuras} aulas futuras · material pendente em {atual.matPend} · PTD pendente em {atual.ptdPend}
                </span>
              </div>
              <div className="tabela-rolagem">
                <table className="tabela tabela-ucs">
                  <thead>
                    <tr><th>UC</th><th className="col-medidor">Carga horária</th><th>Realizado</th><th>Agendado</th><th>Falta</th>
                      <th>Período</th><th>Instrutores</th><th>Preparo</th><th>Situação</th></tr>
                  </thead>
                  <tbody>
                    {atual.ucs.map((u) => {
                      const [rot, st] = ROTULO_UC[u.situacao];
                      const meu = destaqueInstrutor && u.instrutores.some((i) => i.id === destaqueInstrutor);
                      return (
                        <tr key={u.uc.id} className={meu ? 'linha-destaque' : ''}>
                          <td className="uc-nome">
                            <strong>UC{u.uc.numero}</strong> {u.uc.nome}
                            {u.uc.tipo === 'projeto_integrador' && <span className="selo-item">PI</span>}
                          </td>
                          <td className="col-medidor"><Medidor realizado={u.realizado} agendado={u.agendado} total={u.ch} titulo={`UC${u.uc.numero}`} /></td>
                          <td className="num">{fmtH(u.realizado)}</td>
                          <td className="num">{fmtH(u.agendado)} <span className="muted">/ {fmtH(u.ch)}</span></td>
                          <td className="num">{u.aLancar > 0 ? fmtH(u.aLancar) : '—'}</td>
                          <td className="nowrap">{u.primeira ? `${dt(u.primeira)} → ${dt(u.ultima)}` : '—'}</td>
                          <td>
                            <span className="chips-instrutores">
                              {u.instrutores.length ? u.instrutores.map((i) => (
                                <span key={i.id} className="chip-instrutor" title={`${fmtH(i.horas)} agendadas`}>
                                  <span className="bolinha-inline" style={{ background: us.get(i.id)?.cor }} />
                                  {us.get(i.id)?.nome.split(' ')[0] ?? '—'} <small>{fmtH(i.horas)}</small>
                                </span>
                              )) : <span className="muted">—</span>}
                            </span>
                          </td>
                          <td className="nowrap">
                            {u.futuras === 0 ? <span className="muted">—</span> : (
                              <span className="preparo-mini">
                                <span className={u.matPend ? 'pend' : 'ok'} title="Material das aulas futuras">M {u.futuras - u.matPend}/{u.futuras}</span>
                                <span className={u.ptdPend ? 'pend' : 'ok'} title="PTD das aulas futuras">P {u.futuras - u.ptdPend}/{u.futuras}</span>
                              </span>
                            )}
                          </td>
                          <td><Selo status={st}>{rot}</Selo></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Secao>
  );
}
