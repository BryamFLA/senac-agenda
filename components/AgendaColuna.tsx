'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CHAMADA_ATIVA, ITEM_CAMPOS, Item, Turno, eGestor, mensagemErro } from '@/lib/types';
import { deIso, iso } from '@/lib/datas';
import { indices, useCadastros } from './Contexto';
import Grade, { Cartao } from './Grade';
import FormItem from './FormItem';
import DetalheAula from './DetalheAula';
import ReservarLocal from './ReservarLocal';
import Chamada from './Chamada';

export type Modo = 'instrutor' | 'turma' | 'local';
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

const sobrepoe = (a: Item, b: Item) => a.data === b.data && a.hora_inicio < b.hora_fim && b.hora_inicio < a.hora_fim;

/** Uma agenda (de um instrutor, de uma turma ou de um local). Na comparação, várias ficam lado a lado. */
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
  const [reserva, setReserva] = useState<{ data: Date; turno: Turno } | null>(null); // instrutor reservando o local
  const [chamada, setChamada] = useState<Item | null>(null);
  const [comChamada, setComChamada] = useState<Set<string>>(new Set()); // aulas com chamada gravada

  const carregar = useCallback(async () => {
    if (!alvo) { setItens([]); return; }
    setCarregando(true);
    const ini = iso(semanas[0][0]), fim = iso(semanas[semanas.length - 1][5]);
    const q = supabase.from('itens').select(ITEM_CAMPOS).gte('data', ini).lte('data', fim);
    // agenda do local vem por RPC: o instrutor também vê as reservas dos outros, para saber se a sala está livre
    const { data, error } = await (modo === 'local' ? supabase.rpc('agenda_local', { p_local: alvo, p_ini: ini, p_fim: fim })
      : modo === 'instrutor' ? q.eq('instrutor_id', alvo) : q.eq('turma_id', alvo));
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
    const p = idx.usuario.get(i.instrutor_id);
    if (i.tipo === 'evento') {
      return { titulo: i.titulo ?? 'Evento', sub: modo === 'local' ? p?.nome : i.observacao, cor: i.cor ?? '#64748B',
               selo: i.origem === 'v0' ? 'v0' : undefined };
    }
    const t = i.turma_id ? idx.turma.get(i.turma_id) : undefined;
    const u = i.uc_id ? idx.uc.get(i.uc_id) : undefined;
    const ucTxt = u ? `UC${u.numero} · ${u.nome}` : 'UC';
    if (modo === 'local') return { titulo: t?.nome ?? 'Turma', sub: [p?.nome, ucTxt].filter(Boolean).join(' · '), cor: t?.cor ?? '#004A8D' };
    if (modo === 'turma') {
      return { titulo: ucTxt, sub: i.observacao || p?.nome, cor: p?.cor ?? '#004A8D' };
    }
    return { titulo: t?.nome ?? 'Turma', sub: i.observacao || ucTxt, cor: t?.cor ?? '#004A8D' };
  }
  const localTxt = (i: Item) => (i.local_id ? idx.local.get(i.local_id)?.nome : i.local_outro) ?? null;
  // na agenda do local, o choque de sala é calculado aqui: o instrutor não recebe as ocorrências dos itens dos outros
  const choqueLocal = (i: Item) => {
    if (modo !== 'local') return null;
    const o = itens.find((x) => x.id !== i.id && sobrepoe(x, i));
    if (!o) return null;
    const t = o.tipo === 'aula' ? idx.turma.get(o.turma_id ?? '') : undefined;
    const nome = t ? t.codigo ?? t.nome : o.titulo;
    return `Local também reservado para "${nome ?? 'item'}" (${idx.usuario.get(o.instrutor_id)?.nome ?? ''}, ${o.hora_inicio.slice(0, 5)}–${o.hora_fim.slice(0, 5)}).`;
  };
  const descrever = (i: Item): Cartao => ({
    ...cartaoBase(i), alerta: ocorrencias.get(i.id) ?? choqueLocal(i), local: modo === 'local' ? null : localTxt(i),
  });
  // instrutor na agenda do local: só reserva em célula sem item de outra pessoa
  const celulaLivre = (_d: Date, _t: Turno, lista: Item[]) => lista.every((i) => i.instrutor_id === cad.eu.id);

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

  const nome = modo === 'instrutor' ? idx.usuario.get(alvo)?.nome : modo === 'local' ? idx.local.get(alvo)?.nome : idx.turma.get(alvo)?.nome;
  const cor = modo === 'instrutor' ? idx.usuario.get(alvo)?.cor : modo === 'local' ? '#64748B' : idx.turma.get(alvo)?.cor;
  const rotulo = modo === 'instrutor' ? (alvo === cad.eu.id ? 'Minha agenda' : 'Agenda do instrutor')
    : modo === 'local' ? 'Agenda do local' : 'Agenda da turma';

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
                 onCelula={gestor ? (data, turno) => setForm({ data, turno })
                   : modo === 'local' ? (data, turno) => setReserva({ data, turno }) : undefined}
                 podeCelula={!gestor && modo === 'local' ? celulaLivre : undefined} />
        </div>
      )}
      {form && (
        <FormItem modo={modo} alvoId={alvo} data={form.data} turno={form.turno} item={form.item}
                  onClose={() => setForm(null)} onSaved={() => { setForm(null); onAlterou(); }} />
      )}
      {chamada && <Chamada item={chamada} onClose={() => setChamada(null)} onSalvo={carregar} />}
      {detalhe && <DetalheAula item={detalhe} alerta={ocorrencias.get(detalhe.id) ?? choqueLocal(detalhe) ?? undefined}
                               onClose={() => setDetalhe(null)} onAlterou={() => { setDetalhe(null); onAlterou(); }} />}
      {reserva && <ReservarLocal localId={alvo} data={reserva.data} turno={reserva.turno} ocupados={itens}
                                 onClose={() => setReserva(null)} onSalvo={() => { setReserva(null); onAlterou(); }} />}
    </section>
  );
}
