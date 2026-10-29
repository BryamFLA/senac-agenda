'use client';
import { ddmm, deIso, hhmm, nomeDia } from '@/lib/datas';
import type { Turma, Usuario } from '@/lib/types';
import type { ItemPainel } from './dados';
import { Secao, Selo } from './Partes';

export interface Conflito { item: ItemPainel; motivo: string }

export default function Conflitos({ lista, usuarios, turmas, dias }: {
  lista: Conflito[]; usuarios: Usuario[]; turmas: Turma[]; dias: number;
}) {
  const us = new Map(usuarios.map((u) => [u.id, u]));
  const ts = new Map(turmas.map((t) => [t.id, t]));
  const porData = new Map<string, Conflito[]>();
  for (const c of lista) porData.set(c.item.data, [...(porData.get(c.item.data) ?? []), c]);
  const datas = [...porData.keys()].sort();
  const instrutores = new Set(lista.map((c) => c.item.instrutor_id)).size;

  if (!lista.length) {
    return (
      <Secao id="conflitos" destaque="ok" titulo={<><Selo status="bom">Sem conflitos</Selo> Conflitos de horário</>}
             sub={`Nenhum choque de horário nos próximos ${dias} dias para o filtro escolhido.`}>
        <span />
      </Secao>
    );
  }

  return (
    <Secao id="conflitos" destaque="alerta"
           titulo={<><Selo status="critico">{lista.length} {lista.length === 1 ? 'item' : 'itens'}</Selo> Conflitos de horário</>}
           sub={`Próximos ${dias} dias · ${datas.length} ${datas.length === 1 ? 'dia' : 'dias'} · ${instrutores} ${instrutores === 1 ? 'instrutor' : 'instrutores'} envolvidos. Resolva na Agenda (mude data, horário ou pessoa).`}>
      <div className="conflitos-dias">
        {datas.map((d) => (
          <div key={d} className="conflito-dia">
            <div className="conflito-data">
              <strong>{ddmm(deIso(d))}</strong>
              <span>{nomeDia(deIso(d))}</span>
            </div>
            <ul>
              {porData.get(d)!.sort((a, b) => a.item.hora_inicio.localeCompare(b.item.hora_inicio)).map(({ item, motivo }) => {
                const u = us.get(item.instrutor_id);
                const t = item.turma_id ? ts.get(item.turma_id) : undefined;
                return (
                  <li key={item.id}>
                    <span className="conflito-hora">{hhmm(item.hora_inicio)}–{hhmm(item.hora_fim)}</span>
                    <span className="conflito-quem">
                      <span className="bolinha-inline" style={{ background: u?.cor }} /> <strong>{u?.nome ?? '—'}</strong>
                      <span className="muted"> · {t ? (t.codigo ?? t.nome) : item.titulo}</span>
                    </span>
                    <span className="conflito-motivo">{motivo}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Secao>
  );
}
