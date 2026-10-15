'use client';
import { DIAS_LONGOS, ddmm, deIso, diaSemana, hhmm } from '@/lib/datas';
import type { Turma, UC, Usuario } from '@/lib/types';
import { ItemPainel, pct } from './dados';
import { useDica } from './Dica';
import { Secao, Selo } from './Partes';

/** Medidor de proporção pronta (mesma rampa: preenchimento azul sobre trilho azul-claro). */
function Pronto({ ok, total, rotulo }: { ok: number; total: number; rotulo: string }) {
  const dica = useDica();
  return (
    <span className="pronto" {...dica(rotulo, [{ valor: `${ok} de ${total}`, rotulo: `prontos (${pct(ok, total)}%)` }])}>
      <span className="pronto-trilho"><span style={{ width: `${pct(ok, total)}%` }} /></span>
      <span className="pronto-txt">{ok}/{total}</span>
    </span>
  );
}

export default function Preparo({ aulas, dias, usuarios, turmas, ucs }: {
  aulas: ItemPainel[]; dias: number; usuarios: Usuario[]; turmas: Turma[]; ucs: UC[];
}) {
  const us = new Map(usuarios.map((u) => [u.id, u]));
  const ts = new Map(turmas.map((t) => [t.id, t]));
  const ucPor = new Map(ucs.map((u) => [u.id, u]));
  const porInstrutor = [...new Set(aulas.map((a) => a.instrutor_id))].map((id) => {
    const minhas = aulas.filter((a) => a.instrutor_id === id);
    return {
      id, total: minhas.length,
      material: minhas.filter((a) => a.material_ok).length, ptd: minhas.filter((a) => a.ptd_ok).length,
      proxima: minhas.filter((a) => !a.material_ok || !a.ptd_ok).sort((a, b) => (a.data + a.hora_inicio).localeCompare(b.data + b.hora_inicio))[0],
    };
  }).sort((a, b) => (a.total - a.material + a.total - a.ptd) > (b.total - b.material + b.total - b.ptd) ? -1 : 1);
  const pendentes = aulas.filter((a) => !a.material_ok || !a.ptd_ok)
    .sort((a, b) => (a.data + a.hora_inicio).localeCompare(b.data + b.hora_inicio));
  const totMat = aulas.filter((a) => a.material_ok).length, totPtd = aulas.filter((a) => a.ptd_ok).length;

  const tabela = (
    <table className="tabela">
      <thead><tr><th>Instrutor</th><th>Aulas</th><th>Material pronto</th><th>PTD pronto</th></tr></thead>
      <tbody>{porInstrutor.map((p) => (
        <tr key={p.id}><td>{us.get(p.id)?.nome}</td><td className="num">{p.total}</td>
          <td className="num">{p.material} ({pct(p.material, p.total)}%)</td><td className="num">{p.ptd} ({pct(p.ptd, p.total)}%)</td></tr>
      ))}</tbody>
    </table>
  );

  return (
    <Secao id="preparo" titulo="Material e PTD das próximas aulas"
           sub={`Aulas dos próximos ${dias} dias: material ${totMat}/${aulas.length} pronto (${pct(totMat, aulas.length)}%) · PTD ${totPtd}/${aulas.length} pronto (${pct(totPtd, aulas.length)}%).`}
           tabela={tabela}>
      {!aulas.length ? <p className="muted vazio">Nenhuma aula nos próximos {dias} dias para o filtro escolhido.</p> : (
        <div className="preparo-grade">
          <div className="preparo-instrutores">
            <div className="preparo-cab"><span>Instrutor</span><span>Material</span><span>PTD</span></div>
            {porInstrutor.map((p) => (
              <div key={p.id} className="preparo-linha">
                <span className="preparo-nome">
                  <span className="bolinha-inline" style={{ background: us.get(p.id)?.cor }} /> {us.get(p.id)?.nome}
                  <small>{p.total} aula(s)</small>
                </span>
                <Pronto ok={p.material} total={p.total} rotulo={`Material · ${us.get(p.id)?.nome}`} />
                <Pronto ok={p.ptd} total={p.total} rotulo={`PTD · ${us.get(p.id)?.nome}`} />
              </div>
            ))}
          </div>
          <div className="preparo-pendencias">
            <h3>{pendentes.length ? `${pendentes.length} aula(s) com pendência` : 'Tudo pronto'}</h3>
            {!pendentes.length && <p className="muted"><Selo status="bom">Material e PTD prontos</Selo></p>}
            <ul>
              {pendentes.slice(0, 30).map((a) => {
                const t = a.turma_id ? ts.get(a.turma_id) : undefined;
                const u = a.uc_id ? ucPor.get(a.uc_id) : undefined;
                const d = deIso(a.data);
                return (
                  <li key={a.id}>
                    <span className="pend-data"><strong>{ddmm(d)}</strong> <small>{(DIAS_LONGOS[diaSemana(d)] ?? 'Dom').slice(0, 3)} {hhmm(a.hora_inicio)}</small></span>
                    <span className="pend-oque">
                      <strong>{t?.codigo ?? t?.nome}</strong> · UC{u?.numero}
                      <small>{us.get(a.instrutor_id)?.nome}</small>
                    </span>
                    <span className="pend-selos">
                      {!a.material_ok && <Selo status="serio">Material</Selo>}
                      {!a.ptd_ok && <Selo status="serio">PTD</Selo>}
                    </span>
                  </li>
                );
              })}
            </ul>
            {pendentes.length > 30 && <p className="muted">e mais {pendentes.length - 30}…</p>}
          </div>
        </div>
      )}
    </Secao>
  );
}
