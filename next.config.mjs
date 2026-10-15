/** Site 100% estático: o login e a proteção dos dados ficam no Supabase (Auth + RLS). */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  agentRules: false, // não deixar o next dev reescrever o CLAUDE.md
  devIndicators: { position: 'bottom-right' }, // o canto esquerdo é do usuário/Sair no menu
};
export default nextConfig;
