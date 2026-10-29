'use client';
import Icone from './Icone';

export const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Barra de busca + filtros das telas de cadastro. */
export function BarraFiltros({ children, total, rotulo }: { children: React.ReactNode; total: number; rotulo: [string, string] }) {
  return (
    <div className="barra-filtros">
      {children}
      <span className="contagem">{total} {total === 1 ? rotulo[0] : rotulo[1]}</span>
    </div>
  );
}

export function Busca({ valor, onChange, placeholder }: { valor: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="busca barra-busca">
      <Icone nome="busca" tamanho={16} />
      <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {valor && <button type="button" className="limpar" onClick={() => onChange('')} aria-label="Limpar busca"><Icone nome="fechar" tamanho={16} /></button>}
    </label>
  );
}

export function Filtro({ rotulo, valor, onChange, opcoes }: {
  rotulo: string; valor: string; onChange: (v: string) => void; opcoes: { valor: string; nome: string }[];
}) {
  return (
    <label className="filtro-select">
      <span>{rotulo}</span>
      <select value={valor} onChange={(e) => onChange(e.target.value)}>
        {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.nome}</option>)}
      </select>
    </label>
  );
}

export const SITUACOES = [
  { valor: 'ativos', nome: 'Ativos' },
  { valor: 'inativos', nome: 'Inativos' },
  { valor: 'todos', nome: 'Todos' },
];
export const confereSituacao = (situacao: string, ativo: boolean) =>
  situacao === 'todos' || (situacao === 'ativos' ? ativo : !ativo);
