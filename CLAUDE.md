# CLAUDE.md — senac-agenda

Contexto para agentes (Claude Code) trabalharem neste repositório. Leia inteiro antes de mudar algo.

## Quem e para quê
- **Dono:** Bryam Assolini, instrutor de TI no SENAC Francisco Beltrão (PR), unidade UEPT-16.
- **Objetivo:** agenda única do instrutor. As **coordenadoras do SENAC** editam por um site com login; o banco é a
  **única fonte da verdade** da agenda. Ela substitui a planilha `Bryam Agenda.xlsx` (OneDrive), que está aposentada.
- **Consumidores da agenda** (atuais e futuros): Google Calendar do Bryam (espelho), agentes de criação de PTD,
  criação de slides no Canva e preenchimento do rateio de ponto no Senior.
- **Idioma:** toda interface e comunicação em **português do Brasil**. Respostas ao Bryam: curtas, diretas, sem enrolação.

## Stack e identificadores
| Peça | Valor |
|---|---|
| Banco + Auth | Supabase, projeto `senac-agenda`, ref **`lgdbckmppeaddnhecwix`**, região `sa-east-1`, plano free |
| URL Supabase | `https://lgdbckmppeaddnhecwix.supabase.co` (chave publicável em `.env.production`; é pública, a segurança é o RLS) |
| Front-end | Next.js 16 + React 19, **exportação estática** (`output: 'export'` → pasta `out/`). Sem rotas de servidor, sem middleware, sem server actions |
| Hospedagem | Firebase Hosting, projeto **`senac-gestao`**, site padrão (`senac-gestao.web.app`) |
| Domínio | `agenda.bryam.com.br` (custom domain no Firebase; DNS controlado pelo Bryam) |
| Repositório | `github.com/BryamFLA/senac-agenda` (privado), branch `main` |
| CI/CD | `.github/workflows/deploy.yml`: PR → canal de preview; push na `main` → produção |

Plano free do Supabase pode pausar o projeto após dias sem uso — se o site parar de carregar dados, verificar no painel.

## Estrutura
```
app/            layout.tsx (fonte Inter, metadados), page.tsx (sessão, acesso, mês, carga), globals.css (todo o estilo)
components/     Login.tsx, NovaSenha.tsx (recuperação de senha), Grade.tsx (grade semanal), Editor.tsx (modal de edição/cadastro)
lib/            supabase.ts (cliente), types.ts (tipos, TURNOS, CORES, horarioPara), datas.ts (datas locais 'YYYY-MM-DD')
supabase/migrations/   SQL versionado — nomes batem com as versões já aplicadas no banco remoto
scripts/import_excel.py  importação única da aba 2026 da planilha (já executada; não rodar de novo)
```

## Banco (schema `public`)
- **`compromissos`** — catálogo que aparece na lista suspensa.
  `nome` (único), `subtitulo` (2ª linha do cartão: código da turma, PSG, INTEC…), `codigo_turma` (9 dígitos, opcional),
  `cor` (`#RRGGBB`, obrigatório, pinta o cartão), `tipo` (**uso interno**, não aparece na tela), `hora_inicio_padrao`/`hora_fim_padrao`, `ativo`.
- **`agenda`** — um registro por **`(data, turno)`** (constraint única `agenda_um_por_turno`).
  `turno` ∈ `M|T|N`, `compromisso_id`, `hora_inicio`/`hora_fim` (nulos = turno inteiro), `observacao`,
  `gcal_event_id` (técnico, para o espelho no Google), `updated_by`/`updated_at` (preenchidos por trigger).
- **`editores`** — allowlist de e-mails com acesso (`papel`: `admin` | `coordenacao`). Hoje: Bryam (admin) + 2 coordenadoras.
  Para liberar alguém: criar o usuário no Supabase Auth **e** inserir o e-mail (minúsculo) aqui.
- **`agenda_historico`** — auditoria automática (trigger `agenda_audit`): INSERT/UPDATE/DELETE com antes/depois e autor.
  Ignora updates que só mudam `gcal_event_id`/`updated_*` (para a sincronização não poluir o histórico).
- **Segurança:** RLS ligado em todas as tabelas; `anon` sem permissão nenhuma. Toda policy usa `private.is_editor()`
  (security definer, compara o e-mail do JWT com `editores`). Login sem e-mail em `editores` não vê nada.
- **Dados:** 536 registros de 2026 importados da planilha (conferidos 1:1 por hash). 22 compromissos, 15 ativos.

### Regras de domínio (não quebrar)
- **Turnos fixos** (coluna da esquerda da grade): Manhã 08:00–12:00 · Tarde 13:30–17:30 · Noite 19:00–22:00.
  A manhã 08:00–12:00 foi suposição — confirmar com o Bryam se mexer nisso.
- **Horário gravado** = `horarioPara(compromisso, turno)` em `lib/types.ts`: usa o horário próprio do compromisso se ele cair
  naquele turno (ex.: Técnico IA 12:15–17:15), senão o do turno. Tipos `feriado`, `ferias`, `folga` → sem horário.
  Ao editar a mesma célula sem trocar o compromisso, o horário existente é mantido.
- **Cartão** mostra nome + (observação ou subtítulo); o horário só aparece quando difere do horário do turno.
- **Nunca apagar compromisso** — usar `ativo = false` (há registros históricos ligados). Itens genéricos
  (Evento, Folga, Palestra, Planejamento, Reunião, Viagem, Workshop) foram desativados: eventos são cadastrados com nome próprio quando surgem.
- **Sem categorias na tela**: lista única de compromissos, cada um com sua cor. Novo compromisso = nome + turma (opcional) + cor;
  `tipo` é inferido (`aula` se tiver turma, senão `outro`).
- **Google Calendar é espelho**: nunca editar lá; a sincronização sobrescreve.
- Datas sempre como string local `YYYY-MM-DD` (nada de `toISOString()` — fuso `America/Sao_Paulo`).

## Interface
- Tema **somente claro**, identidade SENAC (Manual da Marca): azul `#004A8D` (Pantone 288 C) e laranja `#F7941D` (Pantone 144 C).
  Azul = ações e títulos; laranja = destaque de "hoje"/foco. Fonte Inter, base 16px, visual limpo.
- Grade mensal: semanas empilhadas (SEG–SÁB × Manhã/Tarde/Noite), como a planilha antiga. Clique na célula abre o editor
  (compromisso, turnos, dias da semana, observação). Cor do cartão via CSS `--c` + `color-mix`.

## Desenvolvimento
```powershell
npm install
copy .env.example .env.local
npm run dev        # abrir http://localhost:3000 (não pelo IP da rede: o Next bloqueia o HMR)
npm run lint       # tsc --noEmit
npm run build      # gera out/
```
- O repositório está dentro do **OneDrive** (`C:\Users\bryam\OneDrive\Documents\GitHub\senac-agenda`): `node_modules` pesa na sincronização.
- `typescript` fixado em `~5.9` (o 7.x ainda não é seguro com Next 16).

## Deploy
- Manual: `npm run build` → `firebase deploy --only hosting` (projeto padrão `senac-gestao` no `.firebaserc`).
- Automático: requer o secret `FIREBASE_SERVICE_ACCOUNT_SENAC_GESTAO` no GitHub (gerado por `firebase init hosting:github`;
  apagar os workflows que esse comando cria e manter só `deploy.yml`).
- **Migrações:** já aplicadas no remoto. Arquivos locais têm as mesmas versões do remoto. Antes do primeiro
  `supabase db push`, rodar `supabase link --project-ref lgdbckmppeaddnhecwix` e `supabase migration list` para confirmar que está tudo em sincronia.

## Status (início de out/2026)
- [x] Banco, RLS, histórico, importação 2026, cores por compromisso
- [x] Front: login, recuperação de senha, grade, editor, cadastro com cor
- [x] Usuários: Bryam + coordenadoras criados e liberados em `editores`
- [ ] Publicar no Firebase e apontar `agenda.bryam.com.br`
- [ ] Supabase Auth → URL Configuration: Site URL `https://agenda.bryam.com.br`; Redirect URLs `https://agenda.bryam.com.br/**` e `http://localhost:3000/**`
- [ ] Supabase Auth → desligar "Allow new users to sign up"
- [ ] Secret do Firebase no GitHub (CI)

## Próximas etapas (em ordem)
1. **Sincronização com o Google Calendar** — Edge Function `sync-gcal` (Deno) disparada por **Database Webhook** em
   INSERT/UPDATE/DELETE de `agenda`:
   - autenticação por **conta de serviço** do Google, numa agenda dedicada "SENAC" compartilhada com a conta de serviço
     (evitar OAuth em modo teste: o refresh token expira em 7 dias);
   - INSERT/UPDATE → cria/atualiza evento e grava `gcal_event_id`; DELETE → apaga o evento; sem horário → evento de dia inteiro;
     título = nome do compromisso, descrição = subtítulo/observação; fuso `America/Sao_Paulo`;
   - credenciais em Supabase Secrets, nunca no repositório.
2. **Conferência noturna** — `pg_cron` de madrugada comparando banco × Calendar e corrigindo divergências/falhas
   (decisão do Bryam: webhook + checagem noturna; não usar fila).
3. Opcional: trocar a cor de compromissos existentes pela tela; desativar "Formação pedagógica" se o Bryam pedir.
4. Depois (projeto separado): agentes em Python no Mac mini M4 que leem esta agenda —
   PTDs semanais (Claude API), slides no Canva, rateio de ponto no Senior (Playwright, com revisão humana antes de enviar).

## Pendências para confirmar com o Bryam
- Horário da manhã (assumido 08:00–12:00).
- Código `202600015` do Programador Web veio do Notion (na planilha só aparecia "PSG").
- Nome completo da coordenadora Luciane em `editores`.

## Contexto externo
- Arquivos do SENAC: `D:\SENAC` (clone do OneDrive institucional; estrutura Curso → Turma → UC).
- Notion: página "Arquitetura - Notion OS" e base "Cursos & Turmas" descrevem a organização geral; a agenda **não** vive no Notion.
