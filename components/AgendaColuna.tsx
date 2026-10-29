'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CHAMADA_ATIVA, ITEM_CAMPOS, Item, Turno, eGestor, mensagemErro } from '@/lib/types';
import { deIso, iso } from '@/lib/datas';
import { indices, useCadastros } from './Contexto';
import Grade, { Cartao } from './Grade';
import FormItem from './FormItem';
import DetalheAula from './DetalheAula';
import Chamada from './Chamada';

export type Modo = 'instrutor' | 'turma';
export interface PainelAgenda { id: number; modo: Modo; alvo: string }

interface Props {
  painel: PainelAgenda;
  numero: number;
  ativo: boolean;
  comparando: boolean;
  semanas: Date[][];
  mes: number;
  versao: number; // muda quando qualquer agenda grava algo: todas recarregam
  ocorrencias: Map<string, string>; // item_id → motivo do conflito
  onAtivar: () => void;
  onFechar?: () => void;
  onAlterou: () => void;
}

/** Uma agenda (de um instrutor ou de uma turma). Na comparação, várias ficam lado a lado. */
export default function AgendaColuna({ painel, numero, ativo, comparando, semanas, mes, versao, ocorrencias, onAtivar, onFechar, onAlterou }: Props) {
  const cad = useCadastros();
  const idx = useMemo(() => indices(cad), [cad]);
  const gestor = eGestor(cad.eu);
  const { modo, alvo } = painel;

  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<{ data: Date; turno: Turno; item?: Item } | null>(null);
  const [detalhe, setDetalhe] = useState<Item | null>(null);
  const [chamada, setChamada] = useState<Item | null>(null);
  const [comChamada, setComChamada] = useState<Set<string>>(new Set()); // aulas com chamada gravada

  const carregar = useCallback(async () => {
    if (!alvo) { setItens([]); return; }
    setCarregando(true);
    const q = supabase.from('itens').select(ITEM_CAMPOS)
      .gte('data', iso(semanas[0][0])).lte('data', iso(semanas[semanas.length - 1][5]));
    const { data, error } = await (modo === 'instrutor' ? q.eq('instrutor_id', alvo) : q.eq('turma_id', alvo));
    setCarregando(false);
    if (error) { setErro('Falha ao carregar a agenda.'); return; }
    setErro(null);
    setItens(data as Item[]);
    const aulas = (data as Item[]).filter((i) => i.tipo === 'aula').map((i) => i.id);
    const ch = CHAMADA_ATIVA && aulas.length ? await supabase.from('chamadas').select('item_id').in('item_id', aulas) : { data: [] };
    setComChamada(new Set((ch.data ?? []).map((r) => r.item_id as string)));
  }, [alvo, modo, semanas]);

  useEffect(() => { carregar(); }, [carregar, versao]);

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
  const descrever = (i: Item): Cartao => ({ ...cartaoBase(i), alerta: ocorrencias.get(i.id) ?? null });

  async function marcar(i: Item, campo: 'material' | 'ptd') {
    const valor = campo === 'material' ? !i.material_ok : !i.ptd_ok;
    setItens((l) => l.map((x) => x.id === i.id ? { ...x, [campo === 'material' ? 'material_ok' : 'ptd_ok']: valor } : x));
    const { error } = await supabase.rpc('marcar_item', { p_id: i.id, p_campo: campo, p_valor: valor });
    if (error) { setErro(mensagemErro(error, 'Não foi possível marcar.')); carregar(); }
  }

  const podeMarcar = (i: Item) => gestor || i.instrutor_id === cad.eu.id;
  const hoje = iso(new Date());
  const acoes = (i: Item) => {
    const feita = comChamada.has(i.id), futura = i.data > hoje;
    const pendente = !feita && !futura && podeMarcar(i);
    return (
    <>
      <button type="button" className={`marcacao ${i.material_ok ? 'ok' : ''}`} disabled={!podeMarcar(i)}
              onClick={() => marcar(i, 'material')} aria-pressed={i.material_ok}
              title={i.material_ok ? 'Material pronto' : 'Material pendente'}>
        <span aria-hidden="true">{i.material_ok ? '✓' : '○'}</span> <span className="marcacao-txt">Material</span>
        <span className="marcacao-curto" aria-hidden="true">M</span>
      </button>
      <button type="button" className={`marcacao ${i.ptd_ok ? 'ok' : ''}`} disabled={!podeMarcar(i)}
              onClick={() => marcar(i, 'ptd')} aria-pressed={i.ptd_ok}
              title={i.ptd_ok ? 'PTD pronto' : 'PTD pendente'}>
        <span aria-hidden="true">{i.ptd_ok ? '✓' : '○'}</span> <span className="marcacao-txt">PTD</span>
        <span className="marcacao-curto" aria-hidden="true">P</span>
      </button>
      {/* chamada escondida nesta versão: ver CHAMADA_ATIVA em lib/types.ts */}
      {CHAMADA_ATIVA && (
      <button type="button" className={`marcacao ${feita ? 'ok' : pendente ? 'pendente' : futura ? 'futura' : ''}`} disabled={futura}
              onClick={() => setChamada(i)}
              title={futura ? 'A chamada abre no dia da aula' : feita ? 'Chamada feita: clique para ver ou corrigir' : 'Fazer a chamada'}>
        <span aria-hidden="true">{feita ? '✓' : '○'}</span> <span className="marcacao-txt">Chamada</span>
        <span className="marcacao-curto" aria-hidden="true">C</span>
      </button>
      )}
    </>
    );
  };

  const nome = modo === 'instrutor' ? idx.usuario.get(alvo)?.nome : idx.turma.get(alvo)?.nome;
  const cor = modo === 'instrutor' ? idx.usuario.get(alvo)?.cor : idx.turma.get(alvo)?.cor;
  const rotulo = modo === 'instrutor' ? (alvo === cad.eu.id ? 'Minha agenda' : 'Agenda do instrutor') : 'Agenda da turma';

  return (
    <section className={`agenda-coluna ${comparando ? 'comparando' : ''} ${ativo ? 'ativa' : ''}`}
             onMouseDownCapture={onAtivar} onFocusCapture={onAtivar} aria-label={`${rotulo}: ${nome ?? 'sem seleção'}`}>
      {comparando && (
        <header className="coluna-topo">
          <span className="coluna-numero" title={ativo ? 'Agenda ativa: o filtro à direita muda esta agenda' : 'Clique para ativar'}>{numero}</span>
          {cor && <span className="bolinha-inline grande" style={{ background: cor }} />}
          <div className="coluna-titulo">
            <span className="muted pequeno">{alvo ? rotulo : 'Nova agenda'}</span>
            <h2>{nome ?? 'Escolha no filtro'}</h2>
          </div>
          {onFechar && (
            <button type="button" className="fechar" onClick={(e) => { e.stopPropagation(); onFechar(); }} aria-label={`Fechar agenda ${numero}`}>×</button>
          )}
        </header>
      )}
      {erro && <p className="erro">{erro}</p>}
      {!alvo ? (
        <p className="muted vazio">
          {comparando ? 'Escolha um instrutor ou uma turma no filtro à direita.'
            : gestor ? 'Cadastre instrutores e turmas para começar a montar a agenda.' : 'Nada para mostrar ainda.'}
        </p>
      ) : (
        <div className={carregando ? 'carregando' : ''}>
          <Grade semanas={semanas} mes={mes} itens={itens} grande={!gestor && !comparando} compacto={comparando}
                 descrever={descrever} acoes={acoes}
                 onItem={(i) => (gestor ? setForm({ data: deIso(i.data), turno: i.turno, item: i }) : setDetalhe(i))}
                 onCelula={gestor ? (data, turno) => setForm({ data, turno }) : undefined} />
        </div>
      )}
      {form && (
        <FormItem modo={modo} alvoId={alvo} data={form.data} turno={form.turno} item={form.item}
                  onClose={() => setForm(null)} onSaved={() => { setForm(null); onAlterou(); }} />
      )}
      {chamada && <Chamada item={chamada} onClose={() => setChamada(null)} onSalvo={carregar} />}
      {detalhe && <DetalheAula item={detalhe} alerta={ocorrencias.get(detalhe.id)} onClose={() => setDetalhe(null)} />}
    </section>
  );
}
