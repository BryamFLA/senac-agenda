'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Aluno, Item, SituacaoMatricula, eGestor, horasChamada, mensagemErro } from '@/lib/types';
import { ddmm, deIso, hhmm, iso, nomeDia } from '@/lib/datas';
import { useCadastros } from './Contexto';
import Modal from './Modal';

interface Linha { aluno: Aluno; situacao: SituacaoMatricula }

const faltasDe = (h: boolean[] | undefined) => (h ?? []).filter((x) => !x).length;
const somaMin = (h: string, min: number) => {
  const t = Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) + min;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** Chamada de uma aula: uma presença por hora-aula (C = compareceu, F = faltou), como no sistema do Senac. */
export default function Chamada({ item, onClose, onSalvo }: { item: Item; onClose: () => void; onSalvo: () => void }) {
  const cad = useCadastros();
  const turma = cad.turmas.find((t) => t.id === item.turma_id);
  const curso = cad.cursos.find((c) => c.id === turma?.curso_id);
  const uc = cad.ucs.find((u) => u.id === item.uc_id);
  const horaAula = curso?.hora_aula_min ?? 60;
  const n = horasChamada(item.hora_inicio, item.hora_fim, horaAula);
  const fim = hhmm(item.hora_fim);
  const colunas = Array.from({ length: n }, (_, k) => {
    const ini = somaMin(item.hora_inicio, k * horaAula);
    const f = somaMin(item.hora_inicio, (k + 1) * horaAula);
    return { ini, fim: f > fim || k === n - 1 ? fim : f };
  });

  const futura = item.data > iso(new Date());
  const podeEditar = (eGestor(cad.eu) || item.instrutor_id === cad.eu.id) && !futura;

  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [salvas, setSalvas] = useState<Map<string, boolean[]>>(new Map());
  const [faltasTurma, setFaltasTurma] = useState<Map<string, number>>(new Map());
  const [marcas, setMarcas] = useState<Record<string, boolean[]>>({});
  const [feitaEm, setFeitaEm] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mudou, setMudou] = useState(false);

  useEffect(() => {
    (async () => {
      const [m, p, f] = await Promise.all([
        supabase.from('matriculas').select('situacao, aluno:alunos(id,nome,email,codigo,ativo)').eq('turma_id', item.turma_id!),
        supabase.from('presencas').select('aluno_id,horas,updated_at').eq('item_id', item.id),
        supabase.from('frequencia').select('aluno_id,faltas').eq('turma_id', item.turma_id!),
      ]);
      if (m.error || p.error || f.error) { setErro('Falha ao carregar a chamada.'); setLinhas([]); return; }
      const ls = (m.data as unknown as Linha[]).filter((l) => l.aluno)
        .sort((a, b) => a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR'));
      const sv = new Map((p.data ?? []).map((r) => [r.aluno_id as string, r.horas as boolean[]]));
      const inicial: Record<string, boolean[]> = {};
      for (const l of ls) {
        const s = sv.get(l.aluno.id);
        // sem chamada gravada: aluno normal começa presente; desligado começa com falta
        inicial[l.aluno.id] = Array.from({ length: n }, (_, k) => s?.[k] ?? (s ? s[s.length - 1] : l.situacao === 'normal'));
      }
      setLinhas(ls);
      setSalvas(sv);
      setFaltasTurma(new Map((f.data ?? []).map((r) => [r.aluno_id as string, Number(r.faltas)])));
      setMarcas(inicial);
      const ultima = (p.data ?? []).map((r) => r.updated_at as string).sort().pop();
      setFeitaEm(ultima ?? null);
    })();
  }, [item.id, item.turma_id, n]);

  function alterar(id: string, f: (h: boolean[]) => boolean[]) {
    setMarcas((m) => ({ ...m, [id]: f(m[id]) }));
    setMudou(true);
  }
  function coluna(k: number) {
    if (!linhas) return;
    const todos = linhas.every((l) => marcas[l.aluno.id][k]);
    setMarcas((m) => Object.fromEntries(Object.entries(m).map(([id, h]) => [id, h.map((x, i) => (i === k ? !todos : x))])));
    setMudou(true);
  }

  async function salvar() {
    if (!linhas) return;
    setSalvando(true); setErro(null);
    const registros = linhas.map((l) => ({ aluno_id: l.aluno.id, horas: marcas[l.aluno.id] }));
    const { error } = await supabase.rpc('salvar_chamada', { p_item: item.id, p_registros: registros });
    setSalvando(false);
    if (error) return setErro(mensagemErro(error, 'Não foi possível gravar a chamada.'));
    onSalvo();
    onClose();
  }

  const resumo = useMemo(() => {
    if (!linhas) return null;
    const ativos = linhas.filter((l) => l.situacao === 'normal');
    const presentes = ativos.filter((l) => marcas[l.aluno.id]?.some(Boolean)).length;
    const faltas = ativos.reduce((s, l) => s + faltasDe(marcas[l.aluno.id]), 0);
    return { ativos: ativos.length, presentes, faltas };
  }, [linhas, marcas]);

  const d = deIso(item.data);
  const sub = `${uc ? `UC${uc.numero} · ${uc.nome} · ` : ''}${nomeDia(d)}, ${ddmm(d)} · `
    + `${hhmm(item.hora_inicio)}–${fim} · ${n} hora${n > 1 ? 's' : ''}-aula de ${horaAula} min`;

  return (
    <Modal largo titulo={`Chamada · ${turma?.codigo ?? turma?.nome ?? 'Turma'}`} subtitulo={sub} onClose={onClose}
           rodape={<>
             <span className="muted pequeno">
               {feitaEm ? `Chamada gravada em ${ddmm(new Date(feitaEm))} às ${new Date(feitaEm).toTimeString().slice(0, 5)}` : 'Chamada ainda não gravada'}
             </span>
             <span className="flex" />
             <button className="secundario" onClick={onClose}>{podeEditar ? 'Cancelar' : 'Fechar'}</button>
             {podeEditar && !!linhas?.length && (
               <button onClick={salvar} disabled={salvando || (!mudou && !!feitaEm)}>{salvando ? 'Gravando…' : 'Gravar chamada'}</button>
             )}
           </>}>
      {futura && <p className="nota">A chamada abre no dia da aula.</p>}
      {!futura && !podeEditar && <p className="nota">Só o instrutor desta aula (ou a coordenação) faz a chamada. Você está vendo em modo leitura.</p>}
      {!linhas ? <p className="muted">Carregando…</p> : !linhas.length ? (
        <p className="muted vazio">
          {eGestor(cad.eu) ? 'Nenhum aluno nesta turma. Adicione os alunos no cadastro da turma (menu Turmas).'
            : 'A coordenação ainda não cadastrou os alunos desta turma.'}
        </p>
      ) : (
        <>
          {resumo && (
            <div className="resumo">
              <span><strong>{resumo.presentes}</strong> de {resumo.ativos} alunos presentes</span>
              <span><strong>{resumo.faltas}</strong> falta{resumo.faltas === 1 ? '' : 's'} nesta aula (em horas-aula)</span>
              {podeEditar && <span className="muted">Clique no cabeçalho de uma hora para marcar ou desmarcar a turma toda.</span>}
            </div>
          )}
          <div className="tabela-rolagem">
            <table className="tabela chamada">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Aluno</th>
                  {colunas.map((c, k) => (
                    <th key={k} className="hora-col">
                      {podeEditar ? (
                        <button type="button" className="hora-cab" onClick={() => coluna(k)} title="Marcar ou desmarcar todos nesta hora">
                          <strong>{k + 1}ª</strong><span>{c.ini}</span>
                        </button>
                      ) : <span className="hora-cab"><strong>{k + 1}ª</strong><span>{c.ini}</span></span>}
                    </th>
                  ))}
                  <th className="hora-col" aria-label="Inverter" />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const h = marcas[l.aluno.id] ?? [];
                  const total = (faltasTurma.get(l.aluno.id) ?? 0) - faltasDe(salvas.get(l.aluno.id)) + faltasDe(h);
                  return (
                    <tr key={l.aluno.id} className={l.situacao === 'desligado' ? 'desligado' : ''}>
                      <td className="num">{i + 1}</td>
                      <td>
                        <div className="aluno-nome">{l.aluno.nome}</div>
                        <div className="aluno-meta">
                          {l.aluno.codigo && <span><b>Cód.</b> {l.aluno.codigo}</span>}
                          <span><b>Situação</b> {l.situacao === 'normal' ? 'Normal' : 'Desligado (evadido)'}</span>
                          <span><b>Faltas</b> {total}</span>
                        </div>
                      </td>
                      {h.map((p, k) => (
                        <td key={k} className="hora-col">
                          <button type="button" className={`presenca ${p ? 'sim' : 'nao'}`} disabled={!podeEditar}
                                  aria-pressed={p} onClick={() => alterar(l.aluno.id, (x) => x.map((v, j) => (j === k ? !v : v)))}
                                  aria-label={`${l.aluno.nome}, ${k + 1}ª hora: ${p ? 'compareceu' : 'faltou'}`}
                                  title={`${colunas[k].ini}–${colunas[k].fim}: ${p ? 'compareceu' : 'faltou'}`}>
                            <span className="presenca-bola">{p ? 'C' : 'F'}</span>
                          </button>
                        </td>
                      ))}
                      <td className="hora-col">
                        <button type="button" className="inverter" disabled={!podeEditar}
                                onClick={() => alterar(l.aluno.id, (x) => { const v = !x.every(Boolean); return x.map(() => v); })}
                                aria-label={`${l.aluno.nome}: inverter todas as horas`} title="Presente em todas / falta em todas">⇄</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {erro && <p className="erro">{erro}</p>}
    </Modal>
  );
}
