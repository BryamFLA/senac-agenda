'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtHoras, mensagemErro } from '@/lib/types';
import { segmentarPlano } from '@/lib/plano';
import { useCadastros } from './Contexto';
import Modal from './Modal';

interface UcRascunho {
  numero: number;
  nome: string;
  ch: number;
  tipo: 'regular' | 'projeto_integrador';
  integra: number[];
  indicadores: string[];
  conhecimentos: string[];
  habilidades: string[];
  atitudes: string[];
  falhou?: boolean; // a leitura do detalhamento desta UC falhou
}
interface Rascunho {
  nome: string;
  eixo: string | null;
  segmento: string | null;
  ch_total: number;
  codigo_dn: string | null;
  cbo: string | null;
  hora_aula_min: number;
  ucs: UcRascunho[];
}

const VAZIO: Rascunho = { nome: '', eixo: null, segmento: null, ch_total: 0, codigo_dn: null, cbo: null, hora_aula_min: 60, ucs: [] };
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function lerParte(corpo: object): Promise<any> {
  const { data, error } = await supabase.functions.invoke('ler-plano', { body: corpo });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as { context: Response }).context.json()).erro ?? msg; } catch { /* resposta sem JSON */ }
    throw new Error(msg);
  }
  return data;
}

/** Roda as tarefas com no máximo `n` ao mesmo tempo. */
async function emLotes<T>(tarefas: (() => Promise<T>)[], n: number, aoTerminar: () => void): Promise<PromiseSettledResult<T>[]> {
  const res: PromiseSettledResult<T>[] = new Array(tarefas.length);
  let prox = 0;
  await Promise.all(Array.from({ length: Math.min(n, tarefas.length) }, async () => {
    while (prox < tarefas.length) {
      const i = prox++;
      try { res[i] = { status: 'fulfilled', value: await tarefas[i]() }; }
      catch (e) { res[i] = { status: 'rejected', reason: e }; }
      aoTerminar();
    }
  }));
  return res;
}

export default function ImportarPlano({ manual, onClose }: { manual: boolean; onClose: () => void }) {
  const cad = useCadastros();
  const [etapa, setEtapa] = useState<'arquivo' | 'lendo' | 'revisao'>(manual ? 'revisao' : 'arquivo');
  const [prog, setProg] = useState({ feitos: 0, total: 0, fase: '' });
  const [r, setR] = useState<Rascunho>(manual ? { ...VAZIO, ucs: [] } : VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function ler(arquivo: File) {
    setErro(null); setEtapa('lendo');
    try {
      setProg({ feitos: 0, total: 0, fase: 'Lendo o texto do PDF…' });
      const { textoDoPdf } = await import('@/lib/pdf');
      const partes = segmentarPlano(await textoDoPdf(arquivo));
      if (!partes.ucs.length) throw new Error('Não encontrei o detalhamento das UCs neste PDF. Confira se é um plano de curso do Senac.');

      const total = partes.ucs.length + 1;
      setProg({ feitos: 0, total, fase: 'A IA está lendo o plano (leva cerca de 1 minuto)…' });
      const tarefas = [
        () => lerParte({ parte: 'geral', texto: partes.geral }),
        ...partes.ucs.map((u) => () => lerParte({ parte: 'uc', numero: u.numero, texto: u.texto })),
      ];
      const res = await emLotes(tarefas, 5, () => setProg((p) => ({ ...p, feitos: p.feitos + 1 })));
      if (res[0].status === 'rejected') throw res[0].reason;
      const geral = res[0].value as Rascunho;

      const detalhes: UcRascunho[] = partes.ucs.map((p, i) => {
        const x = res[i + 1];
        if (x.status === 'fulfilled') return { ...x.value, numero: p.numero, tipo: 'regular', integra: [] };
        return { numero: p.numero, nome: '', ch: 0, tipo: 'regular', integra: [], indicadores: [], conhecimentos: [], habilidades: [], atitudes: [], falhou: true };
      });
      // a tabela (geral) dá tipo e "integra"; o detalhamento dá nome, CH e elementos
      const ucs = detalhes.map((d) => {
        const g = geral.ucs.find((u) => u.numero === d.numero && (!d.nome || normal(u.nome).slice(0, 15) === normal(d.nome).slice(0, 15)))
          ?? geral.ucs.find((u) => d.nome && (normal(u.nome).includes(normal(d.nome)) || normal(d.nome).includes(normal(u.nome))));
        const pi = g?.tipo === 'projeto_integrador' || /projeto\s+integrador/i.test(d.nome);
        return {
          ...d,
          nome: d.nome || g?.nome || '',
          ch: d.ch || g?.ch || 0,
          tipo: pi ? 'projeto_integrador' as const : 'regular' as const,
          integra: pi ? (g?.integra ?? []) : [],
        };
      });
      for (const g of geral.ucs) {
        if (!ucs.some((u) => u.numero === g.numero)) {
          ucs.push({ ...g, indicadores: [], conhecimentos: [], habilidades: [], atitudes: [], falhou: true });
        }
      }
      setR({ ...geral, hora_aula_min: 60, ucs: ucs.sort((a, b) => a.numero - b.numero) });
      setEtapa('revisao');
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setEtapa('arquivo');
    }
  }

  const soma = r.ucs.reduce((s, u) => s + Number(u.ch || 0), 0);
  const bate = Math.abs(soma - Number(r.ch_total)) < 0.01;
  const atualizarUc = (i: number, p: Partial<UcRascunho>) => setR({ ...r, ucs: r.ucs.map((u, j) => (j === i ? { ...u, ...p } : u)) });

  async function salvar() {
    setErro(null);
    if (!r.nome.trim() || !(Number(r.ch_total) > 0)) return setErro('Informe o nome e a carga horária total do curso.');
    if (!r.ucs.length) return setErro('O curso precisa de pelo menos uma UC.');
    if (r.ucs.some((u) => !u.nome.trim() || !(Number(u.ch) > 0))) return setErro('Toda UC precisa de nome e carga horária.');
    if (new Set(r.ucs.map((u) => u.numero)).size !== r.ucs.length) return setErro('Há UCs com o mesmo número.');
    if (!bate && !confirm(`A soma das UCs (${fmtHoras(soma)}) não bate com a carga horária total (${fmtHoras(Number(r.ch_total))}). Salvar assim mesmo?`)) return;
    setSalvando(true);
    const { error } = await supabase.rpc('salvar_curso', { p: { ...r, ucs: r.ucs.map(({ falhou: _f, ...u }) => u) } });
    setSalvando(false);
    if (error) return setErro(mensagemErro(error));
    await cad.recarregar();
    onClose();
  }

  return (
    <Modal largo titulo={manual ? 'Novo curso' : 'Importar plano de curso'}
           subtitulo={etapa === 'revisao' ? 'Revise os dados antes de salvar' : 'O PDF é lido pela IA; você revisa tudo antes de gravar'}
           onClose={onClose}
           rodape={etapa === 'revisao' ? <><span className="flex" /><button className="secundario" onClick={onClose}>Cancelar</button>
             <button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar curso'}</button></> : undefined}>
      {etapa === 'arquivo' && (
        <label className="soltar">
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} />
          <strong>Escolher o PDF do plano de curso</strong>
          <span className="muted">Ex.: “Ementa Técnico em Informática para Internet.pdf”</span>
        </label>
      )}
      {etapa === 'lendo' && (
        <div className="lendo">
          <p>{prog.fase}</p>
          {prog.total > 0 && (
            <>
              <div className="barra-prog"><span style={{ width: `${(prog.feitos / prog.total) * 100}%` }} /></div>
              <p className="muted">{prog.feitos} de {prog.total} partes lidas</p>
            </>
          )}
        </div>
      )}
      {etapa === 'revisao' && (
        <>
          <div className="form grade-campos">
            <label className="campo largo">Nome do curso<input value={r.nome} onChange={(e) => setR({ ...r, nome: e.target.value })} /></label>
            <label className="campo">Carga horária total (h)<input type="number" min={0} value={r.ch_total} onChange={(e) => setR({ ...r, ch_total: Number(e.target.value) })} /></label>
            <label className="campo">Hora-aula
              <select value={r.hora_aula_min} onChange={(e) => setR({ ...r, hora_aula_min: Number(e.target.value) })}>
                <option value={60}>60 min</option><option value={50}>50 min</option>
              </select>
            </label>
            <label className="campo">Eixo<input value={r.eixo ?? ''} onChange={(e) => setR({ ...r, eixo: e.target.value })} /></label>
            <label className="campo">Segmento<input value={r.segmento ?? ''} onChange={(e) => setR({ ...r, segmento: e.target.value })} /></label>
            <label className="campo">Código DN<input value={r.codigo_dn ?? ''} onChange={(e) => setR({ ...r, codigo_dn: e.target.value })} /></label>
            <label className="campo">CBO<input value={r.cbo ?? ''} onChange={(e) => setR({ ...r, cbo: e.target.value })} /></label>
          </div>
          <p className={bate ? 'ok-txt' : 'erro'}>
            Soma das UCs: <strong>{fmtHoras(soma)}</strong> de {fmtHoras(Number(r.ch_total))} {bate ? '✓ confere' : '— não confere'}
          </p>
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Nº</th><th>Nome</th><th>CH (h)</th><th>Tipo</th><th>Integra</th><th>Elementos</th><th /></tr></thead>
              <tbody>
                {r.ucs.map((u, i) => (
                  <tr key={i} className={u.falhou ? 'linha-alerta' : ''}>
                    <td><input className="estreito" type="number" min={1} value={u.numero} onChange={(e) => atualizarUc(i, { numero: Number(e.target.value) })} /></td>
                    <td><input value={u.nome} onChange={(e) => atualizarUc(i, { nome: e.target.value })} /></td>
                    <td><input className="estreito" type="number" min={0} step="0.5" value={u.ch} onChange={(e) => atualizarUc(i, { ch: Number(e.target.value) })} /></td>
                    <td>
                      <select value={u.tipo} onChange={(e) => atualizarUc(i, { tipo: e.target.value as UcRascunho['tipo'] })}>
                        <option value="regular">Regular</option><option value="projeto_integrador">Proj. Integrador</option>
                      </select>
                    </td>
                    <td>{u.tipo === 'projeto_integrador' && (
                      <input className="medio" value={u.integra.join(', ')} placeholder="1, 2, 3"
                             onChange={(e) => atualizarUc(i, { integra: e.target.value.split(/[,\s]+/).map(Number).filter((n) => n > 0) })} />
                    )}</td>
                    <td className="muted nowrap" title={u.falhou ? 'A leitura falhou: complete depois em Cursos › Editar UC' : ''}>
                      {u.falhou ? '⚠ não lido' : `${u.indicadores.length} ind · ${u.conhecimentos.length} con · ${u.habilidades.length} hab · ${u.atitudes.length} ati`}
                    </td>
                    <td><button className="link" onClick={() => setR({ ...r, ucs: r.ucs.filter((_, j) => j !== i) })} aria-label="Remover UC">Remover</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="secundario" onClick={() => setR({ ...r, ucs: [...r.ucs, { numero: (r.ucs.at(-1)?.numero ?? 0) + 1, nome: '', ch: 0, tipo: 'regular', integra: [], indicadores: [], conhecimentos: [], habilidades: [], atitudes: [] }] })}>
            + Adicionar UC
          </button>
        </>
      )}
      {erro && <p className="erro">{erro}</p>}
    </Modal>
  );
}
