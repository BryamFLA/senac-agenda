'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CORES, Compromisso, Registro, TIPOS_SEM_HORARIO, Turno, TURNOS, horarioPara } from '@/lib/types';
import { DIAS, DIAS_LONGOS, addDays, ddmm, hhmm, iso, segundaDaSemana } from '@/lib/datas';

interface Props {
  data: Date;
  turno: Turno;
  registro: Registro | null;
  compromissos: Compromisso[];
  onClose: () => void;
  onSaved: () => void;
  onCatalogoMudou: () => void;
}

const NOVO = '__novo__';

export default function Editor({ data, turno, registro, compromissos, onClose, onSaved, onCatalogoMudou }: Props) {
  const segunda = segundaDaSemana(data);
  const diaIdx = Math.round((data.getTime() - segunda.getTime()) / 86400000);

  const [compId, setCompId] = useState<string>(registro?.compromisso_id ?? '');
  const [dias, setDias] = useState<number[]>([diaIdx]);
  const [turnos, setTurnos] = useState<Turno[]>([turno]);
  const [obs, setObs] = useState(registro?.observacao ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // cadastro de novo compromisso
  const [novoNome, setNovoNome] = useState('');
  const [novaTurma, setNovaTurma] = useState('');
  const [novaCor, setNovaCor] = useState(CORES[0]);

  const lista = useMemo(
    () => compromissos
      .filter((c) => c.ativo || c.id === registro?.compromisso_id)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [compromissos, registro],
  );
  const selecionado = compromissos.find((c) => c.id === compId);
  const corAtual = compId === NOVO ? novaCor : selecionado?.cor;

  const alternar = <T,>(l: T[], v: T) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);

  function escolher(id: string) {
    setCompId(id);
    const c = compromissos.find((x) => x.id === id);
    // férias, feriado e folga normalmente valem para o dia todo
    if (c && TIPOS_SEM_HORARIO.includes(c.tipo)) setTurnos(['M', 'T', 'N']);
  }

  async function cadastrarNovo(): Promise<Compromisso | null> {
    const nome = novoNome.trim();
    const turma = novaTurma.trim();
    if (!nome) { setErro('Dê um nome ao novo compromisso.'); return null; }
    const ehCodigo = /^\d{9}$/.test(turma);
    const { data: criado, error } = await supabase.from('compromissos')
      .insert({
        nome,
        subtitulo: turma || null,
        codigo_turma: ehCodigo ? turma : null,
        tipo: turma ? 'aula' : 'outro',
        cor: novaCor.toUpperCase(),
      })
      .select('*').single();
    if (error || !criado) {
      setErro(error?.code === '23505' ? 'Já existe um compromisso com esse nome.' : 'Não foi possível cadastrar.');
      return null;
    }
    onCatalogoMudou();
    return criado as Compromisso;
  }

  async function salvar() {
    setErro(null);
    if (!compId) { setErro('Escolha o compromisso.'); return; }
    if (!dias.length) { setErro('Marque pelo menos um dia.'); return; }
    if (!turnos.length) { setErro('Marque pelo menos um turno.'); return; }
    setSalvando(true);
    const comp = compId === NOVO ? await cadastrarNovo() : selecionado ?? null;
    if (!comp) { setSalvando(false); return; }

    const linhas = dias.flatMap((d) => turnos.map((t) => {
      // ao editar a mesma célula sem trocar o compromisso, mantém o horário que já existia
      const mantem = registro && comp.id === registro.compromisso_id && d === diaIdx && t === turno;
      const h = mantem
        ? { inicio: hhmm(registro.hora_inicio) || null, fim: hhmm(registro.hora_fim) || null }
        : horarioPara(comp, t);
      return {
        data: iso(addDays(segunda, d)),
        turno: t,
        compromisso_id: comp.id,
        hora_inicio: h.inicio,
        hora_fim: h.fim,
        observacao: obs.trim() || null,
      };
    }));
    const { error } = await supabase.from('agenda').upsert(linhas, { onConflict: 'data,turno' });
    setSalvando(false);
    if (error) { setErro('Não foi possível salvar. Tente de novo.'); return; }
    onSaved();
  }

  async function remover() {
    if (!registro) return;
    if (!confirm('Remover este compromisso da agenda?')) return;
    setSalvando(true);
    const { error } = await supabase.from('agenda').delete().eq('id', registro.id);
    setSalvando(false);
    if (error) { setErro('Não foi possível remover.'); return; }
    onSaved();
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>{DIAS_LONGOS[diaIdx]}, {ddmm(data)}</h2>
            <p className="muted">{registro ? 'Editar compromisso' : 'Novo compromisso'}</p>
          </div>
          <button className="fechar" onClick={onClose} aria-label="Fechar">×</button>
        </header>

        <label className="campo">Compromisso
          <div className="select-cor">
            <span className="bolinha" style={{ background: corAtual ?? 'transparent' }} aria-hidden="true" />
            <select value={compId} onChange={(e) => e.target.value === NOVO ? setCompId(NOVO) : escolher(e.target.value)} autoFocus>
              <option value="" disabled>Escolha…</option>
              {lista.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.subtitulo ? ` — ${c.subtitulo}` : ''}</option>)}
              <option value={NOVO}>+ Cadastrar novo…</option>
            </select>
          </div>
        </label>

        {compId === NOVO && (
          <div className="novo">
            <label className="campo">Nome
              <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: Gestão de Projetos de TI" autoFocus />
            </label>
            <label className="campo"><span>Turma <span className="opcional">(opcional)</span></span>
              <input value={novaTurma} onChange={(e) => setNovaTurma(e.target.value)} placeholder="Ex.: 202600150" />
            </label>
            <div className="campo">
              <span>Cor</span>
              <div className="cores">
                {CORES.map((c) => (
                  <button key={c} type="button" className={`cor ${novaCor.toUpperCase() === c ? 'ativa' : ''}`}
                          style={{ background: c }} onClick={() => setNovaCor(c)} aria-label={`Cor ${c}`} aria-pressed={novaCor.toUpperCase() === c} />
                ))}
                <label className={`cor outra ${CORES.includes(novaCor.toUpperCase()) ? '' : 'ativa'}`} title="Outra cor"
                       style={CORES.includes(novaCor.toUpperCase()) ? undefined : { background: novaCor }}>
                  <input type="color" value={novaCor} onChange={(e) => setNovaCor(e.target.value)} aria-label="Escolher outra cor" />
                  {CORES.includes(novaCor.toUpperCase()) && '+'}
                </label>
              </div>
            </div>
            <div className="previa">
              <span className="cartao" style={{ '--c': novaCor } as React.CSSProperties}>
                <span className="nome">{novoNome || 'Prévia do cartão'}</span>
                {novaTurma && <span className="sub">{novaTurma}</span>}
              </span>
            </div>
          </div>
        )}

        <div className="campo">
          <span>Turno</span>
          <div className="opcoes">
            {TURNOS.map((t) => (
              <button key={t.id} type="button" aria-pressed={turnos.includes(t.id)}
                      className={`opcao ${turnos.includes(t.id) ? 'ativa' : ''}`}
                      onClick={() => setTurnos(alternar(turnos, t.id))}>
                {t.nome}
              </button>
            ))}
          </div>
        </div>

        <div className="campo">
          <span>Dias</span>
          <div className="opcoes">
            {DIAS.map((d, i) => (
              <button key={d} type="button" aria-pressed={dias.includes(i)}
                      className={`opcao ${dias.includes(i) ? 'ativa' : ''}`}
                      onClick={() => setDias(alternar(dias, i))}>
                {d} <small>{ddmm(addDays(segunda, i))}</small>
              </button>
            ))}
          </div>
        </div>

        <label className="campo">Observação
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional — ex.: Carnaval, SESC, sala 3" />
        </label>

        {erro && <p className="erro">{erro}</p>}

        <footer>
          {registro && <button className="perigo" onClick={remover} disabled={salvando}>Remover</button>}
          <span className="flex" />
          <button className="secundario" onClick={onClose}>Cancelar</button>
          <button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </footer>
      </div>
    </div>
  );
}
