// Ícones de linha (24×24, traço herdado da cor do texto): menu lateral, navegação, avisos e marcações.
// Usar sempre estes em vez de caracteres (‹ › × ⚠ ✓), que mudam de forma e tamanho de um sistema para outro.
const CAMINHOS: Record<string, string> = {
  agenda: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  painel: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  cursos: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM20 17v4H6.5A2.5 2.5 0 0 1 4 18.5',
  turmas: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  alunos: 'M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 3 9 3 12 0v-5M22 10v6',
  locais: 'M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  pessoas: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  sair: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  busca: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  voltar: 'M15 18l-6-6 6-6',
  avancar: 'M9 18l6-6-6-6',
  fechar: 'M18 6 6 18M6 6l12 12',
  mais: 'M12 5v14M5 12h14',
  check: 'M20 6 9 17l-5-5',
  circulo: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  alerta: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
};

export default function Icone({ nome, tamanho = 20 }: { nome: keyof typeof CAMINHOS | string; tamanho?: number }) {
  return (
    <svg className="ico" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}
