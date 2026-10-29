'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Curso, UC, fmtHoras, mensagemErro } from '@/lib/types';
import { useCadastros } from './Contexto';
import Modal from './Modal';
import Icone from './Icone';
import ImportarPlano from './ImportarPlano';
import { BarraFiltros, Busca, Filtro, SITUACOES, confereSituacao, normal } from './Filtros';
import { nomeAutomatico } from './Turmas';
import { avisar, confirmar } from './Avisos';

const linhas = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

/** Indicadores, conhecimentos, habilidades e atitudes/valores de uma UC. */
export function ElementosUC({ uc }: { uc: UC }) {
  const blocos: [string, string[]][] = [
    ['Indicadores', uc.indicadores], ['Conhecimentos', uc.conhecimentos],
    ['Habilidades', uc.habilidades], ['Atitudes e valores', uc.atitudes],
  ];
  return (
    <div className="elementos">
      {blocos.filter(([, l]) => l.length).map(([nome, l]) => (
        <details key={nome} open={nome === 'Indicadores'}>
          <summary>{nome} <span className="muted">({l.length})</span></summary>
          {nome === 'Indicadores' ? <ol>{l.map((x, i) => <li key={i}>{x}</li>)}</ol> : <ul>{l.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        </details>
      ))}
    </div>
  );
}

export default function Cursos() {
  const cad = useCadastros();
  const [aberto, setAberto] = useState<Curso | null>(null);
  const [importar, setImportar] = useState<'pdf' | 'manual' | null>(null);
  const [busca, setBusca] = useState('');
  const [eixo, setEixo] = useState('');
  const [segmento, setSegmento] = useState('');
  const [situacao, setSituacao] = useState('ativos');

  const distintos = (k: 'eixo' | 'segmento') =>
    [...new Set(cad.cursos.map((c) => c[k]).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const q = normal(busca.trim());
  const lista = cad.cursos
    .filter((c) => confereSituacao(situacao, c.ativo))
    .filter((c) => !eixo || c.eixo === eixo)
    .filter((c) => !segmento || c.segmento === segmento)
    .filter((c) => !q || normal(`${c.nome} ${c.codigo_dn ?? ''} ${c.cbo ?? ''}`).includes(q))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const filtrando = !!(q || eixo || segmento || situacao !== 'ativos');

  return (
    <section className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Cursos</h1>
          <p className="muted">Cursos e unidades curriculares, vindos do plano de curso.</p>
        </div>
        <span className="flex" />
        <button className="secundario" onClick={() => setImportar('manual')}>Cadastrar manualmente</button>
        <button onClick={() => setImportar('pdf')}>Importar plano (PDF)</button>
      </header>
      <BarraFiltros total={lista.length} rotulo={['curso', 'cursos']}>
        <Busca valor={busca} onChange={setBusca} placeholder="Buscar por nome ou código DN" />
        <Filtro rotulo="Eixo" valor={eixo} onChange={setEixo}
                opcoes={[{ valor: '', nome: 'Todos' }, ...distintos('eixo').map((x) => ({ valor: x, nome: x }))]} />
        <Filtro rotulo="Segmento" valor={segmento} onChange={setSegmento}
                opcoes={[{ valor: '', nome: 'Todos' }, ...distintos('segmento').map((x) => ({ valor: x, nome: x }))]} />
        <Filtro rotulo="Situação" valor={situacao} onChange={setSituacao} opcoes={SITUACOES} />
      </BarraFiltros>
      {!lista.length && (
        <p className="muted vazio">
          {filtrando ? 'Nenhum curso com esses filtros.' : 'Nenhum curso ainda. Importe o PDF do plano de curso para começar.'}
        </p>
      )}
      <div className="lista-cartoes">
        {lista.map((c) => {
          const ucs = cad.ucs.filter((u) => u.curso_id === c.id);
          const soma = ucs.reduce((s, u) => s + Number(u.ch), 0);
          const turmas = cad.turmas.filter((t) => t.curso_id === c.id && t.ativo).length;
          return (
            <button key={c.id} className={`cartao-lista ${c.ativo ? '' : 'inativo'}`} onClick={() => setAberto(c)}>
              <strong>{c.nome}</strong>
              {(c.eixo || c.segmento) && <span className="cartao-lista-meta">{[c.eixo, c.segmento].filter(Boolean).join(' · ')}</span>}
              <span className="muted">{fmtHoras(Number(c.ch_total))} · {ucs.length} UCs · hora-aula {c.hora_aula_min} min · {turmas} turma(s)</span>
              {Math.abs(soma - Number(c.ch_total)) > 0.01 && <span className="erro">Soma das UCs: {fmtHoras(soma)}</span>}
              {!c.ativo && <span className="selo-item">inativo</span>}
            </button>
          );
        })}
      </div>
      {aberto && <CursoDetalhe curso={aberto} onClose={() => setAberto(null)} />}
      {importar && <ImportarPlano manual={importar === 'manual'} onClose={() => setImportar(null)} />}
    </section>
  );
}

function CursoDetalhe({ curso, onClose }: { curso: Curso; onClose: () => void }) {
  const cad = useCadastros();
  const [c, setC] = useState(curso);
  const [editUc, setEditUc] = useState<UC | 'nova' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const ucs = cad.ucs.filter((u) => u.curso_id === curso.id).sort((a, b) => a.numero - b.numero);
  const soma = ucs.reduce((s, u) => s + Number(u.ch), 0);

  async function salvar() {
    setSalvando(true); setErro(null);
    const { error } = await supabase.from('cursos').update({
      nome: c.nome.trim(), eixo: c.eixo || null, segmento: c.segmento || null, ch_total: Number(c.ch_total),
      codigo_dn: c.codigo_dn || null, cbo: c.cbo || null, hora_aula_min: Number(c.hora_aula_min), ativo: c.ativo,
    }).eq('id', c.id);
    if (!error && c.nome.trim() !== curso.nome) {
      // o nome da turma é "código · curso": acompanha o novo nome do curso
      await Promise.all(cad.turmas.filter((t) => t.curso_id === c.id && t.codigo)
        .map((t) => supabase.from('turmas').update({ nome: nomeAutomatico(t.codigo!, c.nome.trim()) }).eq('id', t.id)));
    }
    setSalvando(false);
    if (error) return setErro(mensagemErro(error));
    await cad.recarregar();
    avisar('Curso salvo.');
    onClose();
  }

  return (
    <Modal largo titulo={curso.nome} subtitulo={`${ucs.length} UCs · soma ${fmtHoras(soma)} de ${fmtHoras(Number(curso.ch_total))}`}
           onClose={onClose} erro={erro}
           rodape={<><span className="flex" /><button className="secundario" onClick={onClose}>Fechar</button>
             <button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar curso'}</button></>}>
      <div className="form grade-campos">
        <label className="campo largo">Nome<input value={c.nome} onChange={(e) => setC({ ...c, nome: e.target.value })} /></label>
        <label className="campo">Carga horária total (h)<input type="number" min={1} value={c.ch_total} onChange={(e) => setC({ ...c, ch_total: Number(e.target.value) })} /></label>
        <label className="campo">Hora-aula
          <select value={c.hora_aula_min} onChange={(e) => setC({ ...c, hora_aula_min: Number(e.target.value) })}>
            <option value={60}>60 min</option><option value={50}>50 min</option>
          </select>
        </label>
        <label className="campo">Eixo<input value={c.eixo ?? ''} onChange={(e) => setC({ ...c, eixo: e.target.value })} /></label>
        <label className="campo">Segmento<input value={c.segmento ?? ''} onChange={(e) => setC({ ...c, segmento: e.target.value })} /></label>
        <label className="campo">Código DN<input value={c.codigo_dn ?? ''} onChange={(e) => setC({ ...c, codigo_dn: e.target.value })} /></label>
        <label className="campo">CBO<input value={c.cbo ?? ''} onChange={(e) => setC({ ...c, cbo: e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={c.ativo} onChange={(e) => setC({ ...c, ativo: e.target.checked })} /> Curso ativo</label>
      </div>
      <div className="secao-topo">
        <h3>Unidades curriculares</h3>
        <button className="secundario com-icone" onClick={() => setEditUc('nova')}><Icone nome="mais" tamanho={16} /> UC</button>
      </div>
      <div className="lista-ucs">
        {ucs.map((u) => (
          <details key={u.id} className="uc">
            <summary>
              <span><strong>UC{u.numero}</strong> {u.nome}{u.tipo === 'projeto_integrador' && <span className="selo-item">PI</span>}</span>
              <span className="muted">{fmtHoras(Number(u.ch))}</span>
            </summary>
            {u.tipo === 'projeto_integrador' && u.integra.length > 0 && <p className="muted">Integra: {u.integra.map((n) => `UC${n}`).join(', ')}</p>}
            <ElementosUC uc={u} />
            <button className="link" onClick={() => setEditUc(u)}>Editar UC</button>
          </details>
        ))}
      </div>
      {editUc && <EditarUC cursoId={curso.id} uc={editUc === 'nova' ? null : editUc} proximo={(ucs.at(-1)?.numero ?? 0) + 1} onClose={() => setEditUc(null)} />}
    </Modal>
  );
}

function EditarUC({ cursoId, uc, proximo, onClose }: { cursoId: string; uc: UC | null; proximo: number; onClose: () => void }) {
  const cad = useCadastros();
  const [f, setF] = useState({
    numero: uc?.numero ?? proximo, nome: uc?.nome ?? '', ch: uc ? Number(uc.ch) : 0, tipo: uc?.tipo ?? 'regular',
    integra: (uc?.integra ?? []).join(', '), indicadores: (uc?.indicadores ?? []).join('\n'),
    conhecimentos: (uc?.conhecimentos ?? []).join('\n'), habilidades: (uc?.habilidades ?? []).join('\n'),
    atitudes: (uc?.atitudes ?? []).join('\n'),
  });
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!f.nome.trim() || !(f.ch > 0)) return setErro('Informe nome e carga horária.');
    const dados = {
      curso_id: cursoId, numero: Number(f.numero), nome: f.nome.trim(), ch: Number(f.ch), tipo: f.tipo,
      integra: f.integra.split(/[,\s]+/).map(Number).filter((n) => n > 0),
      indicadores: linhas(f.indicadores), conhecimentos: linhas(f.conhecimentos),
      habilidades: linhas(f.habilidades), atitudes: linhas(f.atitudes),
    };
    const { error } = uc ? await supabase.from('ucs').update(dados).eq('id', uc.id) : await supabase.from('ucs').insert(dados);
    if (error) return setErro(mensagemErro(error));
    await cad.recarregar();
    avisar('UC salva.');
    onClose();
  }

  async function apagar() {
    if (!uc || !await confirmar({ titulo: `Apagar UC${uc.numero}?`, texto: 'Só é possível se não houver aulas lançadas nela. Não dá para desfazer.', acao: 'Apagar UC', perigo: true })) return;
    const { error } = await supabase.from('ucs').delete().eq('id', uc.id);
    if (error) return setErro(mensagemErro(error, 'Não foi possível apagar.'));
    await cad.recarregar();
    avisar('UC apagada.');
    onClose();
  }

  const area = (k: 'indicadores' | 'conhecimentos' | 'habilidades' | 'atitudes', rotulo: string) => (
    <label className="campo largo">{rotulo} <span className="opcional">(um por linha)</span>
      <textarea rows={4} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );

  return (
    <Modal largo titulo={uc ? `UC${uc.numero} — ${uc.nome}` : 'Nova UC'} onClose={onClose} erro={erro}
           rodape={<>{uc && <button className="perigo" onClick={apagar}>Apagar UC</button>}<span className="flex" />
             <button className="secundario" onClick={onClose}>Cancelar</button><button onClick={salvar}>Salvar UC</button></>}>
      <div className="form grade-campos">
        <label className="campo">Número<input type="number" min={1} value={f.numero} onChange={(e) => setF({ ...f, numero: Number(e.target.value) })} /></label>
        <label className="campo">Carga horária (h)<input type="number" min={0} step="0.5" value={f.ch} onChange={(e) => setF({ ...f, ch: Number(e.target.value) })} /></label>
        <label className="campo largo">Nome<input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
        <label className="campo">Tipo
          <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as UC['tipo'] })}>
            <option value="regular">Regular</option><option value="projeto_integrador">Projeto Integrador</option>
          </select>
        </label>
        {f.tipo === 'projeto_integrador' && (
          <label className="campo">UCs que integra<input value={f.integra} onChange={(e) => setF({ ...f, integra: e.target.value })} placeholder="Ex.: 1, 2, 3, 4" /></label>
        )}
        {area('indicadores', 'Indicadores')}
        {f.tipo === 'regular' && <>{area('conhecimentos', 'Conhecimentos')}{area('habilidades', 'Habilidades')}{area('atitudes', 'Atitudes e valores')}</>}
      </div>
    </Modal>
  );
}
