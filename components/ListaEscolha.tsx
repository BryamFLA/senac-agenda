'use client';
import { useState } from 'react';
import Icone from './Icone';

/** Situação de um instrutor/turma/data num horário: bloqueio (RH, inválido) impede; conflito só avisa. */
export interface Situacao {
  motivo: string | null;
  conflito: string | null;
}

interface Props {
  rotulo: string;
  itens: { id: string; nome: string; sub?: string | null; cor?: string }[];
  valor: string;
  onChange: (id: string) => void;
  situacao: Map<string, Situacao> | null; // null = verificando (ou sem horário)
  resumo?: string | null;
  manterOrdem?: boolean; // não reordena por nome (só põe os ocupados por último)
}

const semData = (s: string | null) => (s ?? '').replace(/^\d\d\/\d\d: /, '');

/**
 * Lista de escolha com a disponibilidade de cada opção: livres primeiro; em conflito de horário com o nome
 * em vermelho (dá para escolher, com aviso); bloqueadas pelas regras do RH em vermelho e desabilitadas.
 */
export default function ListaEscolha({ rotulo, itens, valor, onChange, situacao, resumo, manterOrdem }: Props) {
  const [busca, setBusca] = useState('');
  const peso = (id: string) => (!situacao ? 0 : situacao.get(id)?.motivo ? 2 : situacao.get(id)?.conflito ? 1 : 0);
  const q = busca.trim().toLowerCase();
  const lista = itens
    .filter((x) => !q || `${x.nome} ${x.sub ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => peso(a.id) - peso(b.id) || (manterOrdem ? 0 : a.nome.localeCompare(b.nome, 'pt-BR')));

  return (
    <div className="campo">
      <span>{rotulo}</span>
      {itens.length > 7 && (
        <label className="busca">
          <Icone nome="busca" tamanho={16} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" aria-label={`Buscar ${rotulo.toLowerCase()}`} />
        </label>
      )}
      <ul className="escolha" role="listbox" aria-label={rotulo}>
        {lista.map((x) => {
          const s = situacao?.get(x.id);
          const bloqueado = !!s?.motivo;
          const conflito = !bloqueado && !!s?.conflito;
          const sel = valor === x.id;
          return (
            <li key={x.id} role="none">
              <button type="button" role="option" aria-selected={sel} disabled={bloqueado && !sel}
                      className={`escolha-item ${sel ? 'sel' : ''} ${bloqueado ? 'bloq' : conflito ? 'conflito' : ''}`}
                      onClick={() => onChange(x.id)}>
                {x.cor && <span className="bolinha-inline" style={{ background: x.cor }} />}
                <span className="escolha-texto">
                  <span className="escolha-nome">{x.nome}{x.sub && <small> · {x.sub}</small>}</span>
                  {(bloqueado || conflito) && <small className="escolha-motivo">{semData(bloqueado ? s!.motivo : s!.conflito)}</small>}
                </span>
                {sel && <span className="escolha-check"><Icone nome="check" tamanho={16} /></span>}
              </button>
            </li>
          );
        })}
        {!lista.length && <li role="none" className="muted pequeno filtro-vazio">Nada encontrado.</li>}
      </ul>
      {resumo && <span className="dica">{resumo}</span>}
    </div>
  );
}
