'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CORES, DIA_TODO, Item, TURNOS, Turno, fmtMin, mensagemErro, minutos } from '@/lib/types';
import { DIAS_LONGOS, ddmm, deIso, diaSemana, diasUteisDoMes, hhmm, iso } from '@/lib/datas';
import { useCadastros } from './Contexto';
import Modal, { SeletorCor } from './Modal';
import MiniCalendario from './MiniCalendario';
import ListaEscolha, { Situacao } from './ListaEscolha';

interface Props {
  modo: 'instrutor' | 'turma' | 'local'; // filtro da agenda: fixa o instrutor, a turma ou o local num lançamento novo
  alvoId: string;
  data: Date; // célula clicada (ou data do item)
  turno: Turno;
  item?: Item; // edição
  onClose: () => void;
  onSaved: () => void;
}

const EVENTOS = ['Reunião', 'Viagem', 'Formação pedagógica', 'Planejamento', 'Evento', 'Férias', 'Folga', 'Feriado'];
const NAO_TRABALHO = ['Férias', 'Folga', 'Feriado'];

export default function FormItem({ modo, alvoId, data, turno, item, onClose, onSaved }: Props) {
  const cad = useCadastros();
  const editando = !!item;
  const t0 = TURNOS.find((t) => t.id === turno)!;

  const [tipo, setTipo] = useState<'aula' | 'evento'>(item?.tipo ?? 'aula');
  const [instrutorId, setInstrutorId] = useState(item?.instrutor_id ?? (modo === 'instrutor' ? alvoId : ''));
  const [turmaId, setTurmaId] = useState(item?.turma_id ?? (modo === 'turma' ? alvoId : ''));
  const [ucId, setUcId] = useState(item?.uc_id ?? '');
  const [titulo, setTitulo] = useState(item?.titulo ?? '');
  const [cor, setCor] = useState(item?.cor ?? '#64748B');
  const [trabalho, setTrabalho] = useState(item?.trabalho ?? true);
  const [inicio, setInicio] = useState(item ? hhmm(item.hora_inicio) : t0.inicio);
  const [fim, setFim] = useState(item ? hhmm(item.hora_fim) : t0.fim);
  const [obs, setObs] = useState(item?.observacao ?? '');
  const [localId, setLocalId] = useState(item?.local_id ?? (!item && modo === 'local' ? alvoId : ''));
  const [outroLocal, setOutroLocal] = useState(!!item?.local_outro);
  const [localTexto, setLocalTexto] = useState(item?.local_outro ?? '');
  const [datas, setDatas] = useState<Set<string>>(new Set([iso(data)]));
  const [dataUnica, setDataUnica] = useState(iso(data));
  const [cal, setCal] = useState({ ano: data.getFullYear(), mes: data.getMonth() });
  const [motivos, setMotivos] = useState<Map<string, Situacao> | null>(null);
  const [livresPorTurno, setLivresPorTurno] = useState<Record<string, number> | null>(null);
  const [agendadoUc, setAgendadoUc] = useState<Map<string, number>>(new Map());
  const [confirmaCh, setConfirmaCh] = useState(false);
  const [confirmaConflito, setConfirmaConflito] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const instrutores = cad.usuarios.filter((u) => u.leciona && (u.ativo || u.id === instrutorId));
  const turmas = cad.turmas.filter((t) => t.ativo || t.id === turmaId);
  const turma = cad.turmas.find((t) => t.id === turmaId);
  const ucs = cad.ucs.filter((u) => turma && u.curso_id === turma.curso_id).sort((a, b) => a.numero - b.numero);
  const uc = cad.ucs.find((u) => u.id === ucId);
  const instrutor = cad.usuarios.find((u) => u.id === instrutorId);
  const locais = cad.locais.filter((l) => l.ativo || l.id === localId);
  const ehAula = tipo === 'aula';

  // horas já agendadas por UC na turma (para "restam Xh")
  useEffect(() => {
    if (!turmaId) { setAgendadoUc(new Map()); return; }
    supabase.from('progresso').select('uc_id,horas_agendadas').eq('turma_id', turmaId).then(({ data: p }) => {
      setAgendadoUc(new Map((p ?? []).map((x) => [x.uc_id as string, Number(x.horas_agendadas)])));
    });
  }, [turmaId]);

  // situação de cada instrutor/turma no dia clicado (ou no dia do item) nesse horário
  const [ocupacao, setOcupacao] = useState<Map<string, Situacao> | null>(null);
  const dataBase = editando ? dataUnica : iso(data);
  useEffect(() => {
    if (fim <= inicio) { setOcupacao(null); return; }
    let vivo = true;
    const h = setTimeout(async () => {
      const { data: r } = await supabase.rpc('ocupacao_no_horario', { p_data: dataBase, p_ini: inicio, p_fim: fim, p_ignorar: item?.id ?? null });
      if (vivo) setOcupacao(new Map((r ?? []).map((x: { id: string } & Situacao) => [x.id, { motivo: x.motivo, conflito: x.conflito }])));
    }, 250);
    return () => { vivo = false; clearTimeout(h); };
  }, [dataBase, inicio, fim, item?.id]);

  const resumoLista = (lista: { id: string }[]) => {
    if (!ocupacao) return null;
    const livres = lista.filter((x) => !ocupacao.get(x.id)?.motivo && !ocupacao.get(x.id)?.conflito).length;
    return `${livres} de ${lista.length} livres em ${ddmm(deIso(dataBase))}, ${inicio}–${fim}. Em vermelho: horário ocupado.`;
  };

  // datas consultadas: os dois meses visíveis (novo) ou a data do item (edição)
  const datasConsulta = useMemo(() => {
    if (editando) return [dataUnica];
    const s = new Set<string>(datas);
    for (const k of [0, 1]) {
      const d = new Date(cal.ano, cal.mes + k, 1);
      diasUteisDoMes(d.getFullYear(), d.getMonth()).forEach((x) => s.add(iso(x)));
    }
    return [...s].sort();
  }, [editando, dataUnica, datas, cal]);

  const pronto = !!instrutorId && (!ehAula || (!!turmaId && !!ucId)) && (ehAula || !!titulo.trim()) && fim > inicio;

  const rpc = (ini: string, f: string) => supabase.rpc('disponibilidade_datas', {
    p_datas: datasConsulta, p_ini: ini, p_fim: f, p_instrutor: instrutorId, p_tipo: tipo,
    p_turma: ehAula ? turmaId : null, p_uc: ehAula ? ucId : null, p_trabalho: ehAula ? true : trabalho,
    p_ignorar: item?.id ?? null, p_local: localId || null,
  });

  useEffect(() => {
    if (!pronto) { setMotivos(null); return; }
    let vivo = true;
    setMotivos(null);
    const h = setTimeout(async () => {
      const { data: r, error } = await rpc(inicio, fim);
      if (!vivo) return;
      if (error) { setErro(mensagemErro(error, 'Falha ao verificar a disponibilidade.')); return; }
      setMotivos(new Map((r ?? []).map((x: { data: string } & Situacao) => [x.data, { motivo: x.motivo, conflito: x.conflito }])));
    }, 250);
    return () => { vivo = false; clearTimeout(h); };
  }, [pronto, datasConsulta, inicio, fim, instrutorId, turmaId, ucId, tipo, trabalho, localId]);

  // horários compatíveis: quantas datas visíveis estão livres em cada turno
  useEffect(() => {
    if (!pronto || editando) { setLivresPorTurno(null); return; }
    let vivo = true;
    const h = setTimeout(async () => {
      const r: Record<string, number> = {};
      await Promise.all(TURNOS.map(async (t) => {
        const { data: x } = await rpc(t.inicio, t.fim);
        const hojeIso = iso(new Date());
        r[t.id] = (x ?? []).filter((y: { data: string } & Situacao) => !y.motivo && !y.conflito && y.data >= hojeIso).length;
      }));
      if (vivo) setLivresPorTurno(r);
    }, 400);
    return () => { vivo = false; clearTimeout(h); };
  }, [pronto, editando, datasConsulta, instrutorId, turmaId, ucId, tipo, trabalho, localId]);

  const durMin = fim > inicio ? minutos(inicio, fim) : 0;
  const n = editando ? 1 : datas.size;
  const totalMin = n * durMin;
  const chUcMin = uc ? Number(uc.ch) * 60 : 0;
  const antesMin = uc ? (agendadoUc.get(uc.id) ?? 0) * 60
    - (item && item.uc_id === uc.id && item.turma_id === turmaId ? minutos(item.hora_inicio, item.hora_fim) : 0) : 0;
  const depoisMin = antesMin + totalMin;
  // só pede confirmação quando o lançamento aumenta as horas de uma UC que passa da CH
  const agendadoAtualMin = uc ? (agendadoUc.get(uc.id) ?? 0) * 60 : 0;
  const passaCh = ehAula && !!uc && depoisMin > chUcMin && depoisMin > agendadoAtualMin;

  // na edição, só pede nova confirmação de conflito se mexer em data, horário, instrutor ou turma
  const mudouHorario = !item || item.data !== dataUnica || hhmm(item.hora_inicio) !== inicio || hhmm(item.hora_fim) !== fim
    || item.instrutor_id !== instrutorId || item.turma_id !== (ehAula ? turmaId : null) || (item.local_id ?? '') !== localId;
  const selecionadas = [...(editando ? [dataUnica] : datas)].sort();
  const selecionadasBloqueadas = selecionadas.map((d) => motivos?.get(d)?.motivo).filter((m): m is string => !!m);
  const selecionadasConflito = selecionadas.map((d) => motivos?.get(d)?.conflito).filter((m): m is string => !!m);

  function alternar(d: string) {
    setDatas((s) => { const n2 = new Set(s); if (n2.has(d)) n2.delete(d); else n2.add(d); return n2; });
  }
  function alternarDiaSemana(_dow: number, lista: string[]) {
    const livres = lista.filter((d) => !motivos?.get(d)?.motivo && !motivos?.get(d)?.conflito);
    setDatas((s) => {
      const n2 = new Set(s);
      const todasMarcadas = livres.every((d) => n2.has(d));
      livres.forEach((d) => (todasMarcadas ? n2.delete(d) : n2.add(d)));
      return n2;
    });
  }
  function escolherEvento(nome: string) {
    setTitulo(nome);
    if (NAO_TRABALHO.includes(nome)) { setTrabalho(false); setInicio(DIA_TODO.inicio); setFim(DIA_TODO.fim); }
    else setTrabalho(true);
  }

  async function salvar() {
    setErro(null);
    if (!instrutorId) return setErro('Escolha o instrutor.');
    if (ehAula && (!turmaId || !ucId)) return setErro('Escolha a turma e a UC.');
    if (!ehAula && !titulo.trim()) return setErro('Dê um nome ao evento.');
    if (fim <= inicio) return setErro('O horário final precisa ser depois do inicial.');
    if (outroLocal && !localTexto.trim()) return setErro('Digite o local ou escolha um da lista.');
    if (!editando && !datas.size) return setErro('Marque pelo menos uma data no calendário.');
    if (selecionadasBloqueadas.length) return setErro(selecionadasBloqueadas.slice(0, 3).join(' '));
    if (passaCh && !confirmaCh) return setErro('Confirme que o lançamento passa da carga horária da UC.');
    if (selecionadasConflito.length && mudouHorario && !confirmaConflito) return setErro('Há conflito de horário: confirme para lançar assim mesmo.');

    const base = {
      tipo, hora_inicio: inicio, hora_fim: fim, instrutor_id: instrutorId,
      turma_id: ehAula ? turmaId : null, uc_id: ehAula ? ucId : null,
      titulo: ehAula ? null : titulo.trim(), cor: ehAula ? null : cor,
      trabalho: ehAula ? true : trabalho, observacao: obs.trim() || null,
      local_id: outroLocal ? null : localId || null, local_outro: outroLocal ? localTexto.trim() : null,
    };
    setSalvando(true);
    let error;
    if (editando) {
      ({ error } = await supabase.from('itens').update({ ...base, data: dataUnica }).eq('id', item.id));
    } else {
      const serie = datas.size > 1 ? crypto.randomUUID() : null;
      ({ error } = await supabase.from('itens').insert([...datas].sort().map((d) => ({ ...base, data: d, serie_id: serie }))));
    }
    setSalvando(false);
    if (error) return setErro(mensagemErro(error));
    onSaved();
  }

  async function apagar(serie: boolean) {
    if (!item) return;
    const pergunta = serie ? 'Apagar este item e os próximos da mesma série?' : 'Apagar este item da agenda?';
    if (!confirm(pergunta)) return;
    setSalvando(true);
    const q = supabase.from('itens').delete();
    const { error } = serie && item.serie_id
      ? await q.eq('serie_id', item.serie_id).gte('data', item.data)
      : await q.eq('id', item.id);
    setSalvando(false);
    if (error) return setErro(mensagemErro(error, 'Não foi possível apagar.'));
    onSaved();
  }

  const fixoInstrutor = !editando && modo === 'instrutor';
  const fixoTurma = !editando && modo === 'turma';
  const localAgenda = modo === 'local' ? cad.locais.find((l) => l.id === alvoId) : undefined;
  const dDia = editando ? deIso(dataUnica) : data;

  return (
    <Modal largo={!editando}
           titulo={editando ? `${DIAS_LONGOS[diaSemana(dDia)] ?? 'Domingo'}, ${ddmm(dDia)}` : 'Lançar na agenda'}
           subtitulo={editando ? (item.origem === 'v0' ? 'Importado da agenda antiga — dá para converter em aula' : 'Editar') :
             fixoInstrutor ? `Agenda de ${instrutor?.nome ?? ''}` : localAgenda ? `Agenda do local ${localAgenda.nome}` : `Agenda da turma ${turma?.nome ?? ''}`}
           onClose={onClose}
           rodape={<>
             {editando && <button className="perigo" onClick={() => apagar(false)} disabled={salvando}>Apagar</button>}
             {editando && item.serie_id && <button className="perigo" onClick={() => apagar(true)} disabled={salvando}>Apagar esta e as próximas</button>}
             <span className="flex" />
             <button className="secundario" onClick={onClose}>Cancelar</button>
             <button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : editando ? 'Salvar' : `Lançar${n > 1 ? ` ${n} datas` : ''}`}</button>
           </>}>
      <div className={editando ? 'form' : 'form duas-colunas'}>
        <div className="form">
          <div className="opcoes" role="group" aria-label="Tipo">
            <button type="button" className={`opcao ${ehAula ? 'ativa' : ''}`} aria-pressed={ehAula} onClick={() => setTipo('aula')}>Aula</button>
            <button type="button" className={`opcao ${!ehAula ? 'ativa' : ''}`} aria-pressed={!ehAula} onClick={() => setTipo('evento')}>Evento avulso</button>
          </div>

          {fixoInstrutor ? null : (
            <ListaEscolha rotulo="Instrutor" valor={instrutorId} onChange={setInstrutorId} situacao={ocupacao}
                          itens={instrutores.map((u) => ({ id: u.id, nome: u.nome, cor: u.cor }))}
                          resumo={resumoLista(instrutores)} />
          )}

          {ehAula && !fixoTurma && (
            <ListaEscolha rotulo="Turma" valor={turmaId} onChange={(id) => { setTurmaId(id); setUcId(''); }} situacao={ocupacao}
                          itens={turmas.map((t) => ({ id: t.id, nome: t.codigo ?? t.nome, sub: cad.cursos.find((c) => c.id === t.curso_id)?.nome, cor: t.cor }))}
                          resumo={resumoLista(turmas)} />
          )}

          {ehAula && (
            <label className="campo">Unidade curricular
              <select value={ucId} onChange={(e) => setUcId(e.target.value)} disabled={!turma}>
                <option value="" disabled>{turma ? 'Escolha…' : 'Escolha a turma primeiro'}</option>
                {ucs.map((u) => {
                  const resta = Number(u.ch) - (agendadoUc.get(u.id) ?? 0);
                  return <option key={u.id} value={u.id}>UC{u.numero} — {u.nome} ({resta > 0 ? `faltam ${fmtMin(resta * 60)}` : 'CH completa'})</option>;
                })}
              </select>
            </label>
          )}

          {!ehAula && (
            <>
              <label className="campo">Evento
                <input list="eventos" value={titulo} onChange={(e) => escolherEvento(e.target.value)} placeholder="Ex.: Reunião pedagógica" />
                <datalist id="eventos">{EVENTOS.map((e) => <option key={e} value={e} />)}</datalist>
              </label>
              <label className="check">
                <input type="checkbox" checked={trabalho} onChange={(e) => setTrabalho(e.target.checked)} />
                Conta como trabalho (entra no limite de 10 h/dia e nas 11 h de descanso)
              </label>
              <div className="campo"><span>Cor</span><SeletorCor cores={CORES} valor={cor} onChange={setCor} /></div>
            </>
          )}

          <div className="campo">
            <span>Horário</span>
            <div className="opcoes">
              {TURNOS.map((t) => (
                <button key={t.id} type="button" className={`opcao ${inicio === t.inicio && fim === t.fim ? 'ativa' : ''}`}
                        onClick={() => { setInicio(t.inicio); setFim(t.fim); }}>
                  {t.nome}{livresPorTurno && <small>{livresPorTurno[t.id]} livres</small>}
                </button>
              ))}
              {!ehAula && (
                <button type="button" className={`opcao ${inicio === DIA_TODO.inicio && fim === DIA_TODO.fim ? 'ativa' : ''}`}
                        onClick={() => { setInicio(DIA_TODO.inicio); setFim(DIA_TODO.fim); }}>Dia todo</button>
              )}
            </div>
            <div className="horas">
              <input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} aria-label="Início" />
              <span>até</span>
              <input type="time" value={fim} onChange={(e) => setFim(e.target.value)} aria-label="Fim" />
              <span className="muted">{durMin > 0 ? fmtMin(durMin) : ''}</span>
            </div>
          </div>

          {editando && (
            <label className="campo">Data
              <input type="date" value={dataUnica} onChange={(e) => e.target.value && setDataUnica(e.target.value)} />
            </label>
          )}

          <ListaEscolha rotulo="Local" manterOrdem situacao={ocupacao}
                        valor={outroLocal ? '__outro' : localId}
                        onChange={(id) => { setOutroLocal(id === '__outro'); setLocalId(id === '__outro' ? '' : id); }}
                        itens={[{ id: '', nome: 'Sem local' }, ...locais.map((l) => ({ id: l.id, nome: l.nome })),
                                { id: '__outro', nome: 'Outro local (digitar)' }]}
                        resumo={resumoLista(locais)} />
          {outroLocal && (
            <label className="campo">Qual local?
              <input value={localTexto} onChange={(e) => setLocalTexto(e.target.value)} placeholder="Ex.: Empresa parceira, visita técnica" />
            </label>
          )}

          <label className="campo">Observação
            <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional — ex.: avaliação, trazer material" />
          </label>
        </div>

        {!editando && (
          <div className="form">
            {pronto ? (
              <MiniCalendario ano={cal.ano} mes={cal.mes} selecionadas={datas} motivos={motivos}
                              onNavegar={(k) => setCal((c) => { const d = new Date(c.ano, c.mes + k, 1); return { ano: d.getFullYear(), mes: d.getMonth() }; })}
                              onAlternar={alternar} onDiaSemana={alternarDiaSemana} />
            ) : (
              <p className="muted vazio">
                {ehAula ? 'Escolha instrutor, turma e UC' : 'Dê um nome ao evento'} para ver as datas livres no calendário.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="resumo">
        <span><strong>{n}</strong> {n === 1 ? 'data' : 'datas'} × {fmtMin(durMin)} = <strong>{fmtMin(totalMin)}</strong></span>
        {ehAula && uc && (
          <span className={passaCh ? 'erro' : ''}>
            UC{uc.numero}: {fmtMin(antesMin)} → <strong>{fmtMin(depoisMin)}</strong> de {fmtMin(chUcMin)}
            {passaCh ? ` (passa ${fmtMin(depoisMin - chUcMin)})` : ` (faltarão ${fmtMin(chUcMin - depoisMin)})`}
          </span>
        )}
        {!editando && datas.size > 0 && (
          <span className="muted">
            {[...datas].sort().slice(0, 8).map((d) => ddmm(deIso(d))).join(', ')}{datas.size > 8 ? '…' : ''}
          </span>
        )}
      </div>
      {passaCh && (
        <label className="check">
          <input type="checkbox" checked={confirmaCh} onChange={(e) => setConfirmaCh(e.target.checked)} />
          Confirmo lançar além da carga horária da UC
        </label>
      )}
      {selecionadasBloqueadas.length > 0 && (
        <div className="alerta bloqueio">
          <strong>Não dá para lançar {selecionadasBloqueadas.length === 1 ? 'nesta data' : `em ${selecionadasBloqueadas.length} datas`}:</strong>
          <ul>{selecionadasBloqueadas.slice(0, 5).map((m, i) => <li key={i}>{m}</li>)}</ul>
          {!editando && <span>Desmarque essas datas no calendário.</span>}
        </div>
      )}
      {selecionadasConflito.length > 0 && (
        <div className="alerta conflito">
          <strong>⚠ Conflito de horário {selecionadasConflito.length === 1 ? 'nesta data' : `em ${selecionadasConflito.length} datas`}:</strong>
          <ul>{selecionadasConflito.slice(0, 5).map((m, i) => <li key={i}>{m}</li>)}</ul>
          {selecionadasConflito.length > 5 && <span>e mais {selecionadasConflito.length - 5}…</span>}
          {mudouHorario ? (
            <label className="check">
              <input type="checkbox" checked={confirmaConflito} onChange={(e) => setConfirmaConflito(e.target.checked)} />
              {editando ? 'Salvar mesmo assim' : 'Lançar mesmo assim'} (o conflito fica marcado em vermelho na agenda)
            </label>
          ) : <span>Este item já está em conflito. Mude o horário, a data ou a pessoa para resolver.</span>}
        </div>
      )}
      {erro && <p className="erro">{erro}</p>}
    </Modal>
  );
}

