# CLAUDE.md — senac-agenda

Contexto para agentes (Claude Code) trabalharem neste repositório. Leia inteiro antes de mudar algo.

> **Momento do projeto (08/10/2026):** a **v1** (distribuição de aulas e carga horária para a unidade inteira, com
> interfaces de TEPTs e Instrutores) está **implementada na branch `v1-desenho`**. O **banco de produção já está no modelo
> da v1** (tabelas novas + dados da v0 importados); as tabelas da v0 continuam lá, intactas. O site em
> `agenda.bryam.com.br` ainda é a **v0** até o merge na `main` (virada decidida pelo Bryam).
> Desenho: `docs/superpowers/specs/2026-10-08-v1-design.md`.

## Quem e para quê
- **Dono:** Bryam Assolini, instrutor de TI no SENAC Francisco Beltrão (PR), unidade UEPT-16.
- **Objetivo:** sistema de **agenda/distribuição de aulas** e **controle de carga horária** dos cursos do SENAC.
  O banco (Supabase) é a **única fonte da verdade**. Substitui planilhas (a `Bryam Agenda.xlsx` está aposentada).
- **Usuários:**
  - **TEPTs** — as gestoras/coordenadoras do SENAC. Montam a agenda de instrutores e turmas.
  - **Instrutores** — os professores. Consultam a própria agenda e marcam o andamento das aulas (material e PTD).
- **Idioma:** toda interface e comunicação em **português do Brasil**. Respostas ao Bryam: curtas, diretas, sem enrolação.

## Domínio (vocabulário do SENAC)
- **Curso** → tem várias **UCs** (Unidades Curriculares). Cada UC tem uma **carga horária (CH)**; a soma das UCs fecha a CH do curso.
- **Turma** → uma oferta de um curso (há várias turmas do mesmo curso). Código da turma: 9 dígitos (ex.: `202600015`).
- **Instrutor** → pode dar aula em qualquer turma. Normalmente fecha uma UC sozinho numa turma, **mas não é regra**
  (uma UC de uma turma pode ser dividida entre instrutores).
- **Aula** → acontece num **turno** (Manhã, Tarde ou Noite) de uma data, para uma turma, numa UC, com um instrutor.
  Tem horário (padrão do turno, mas editável) e duas pendências do instrutor: **PTD** e **material da aula**.
- **PTD** — Plano de Trabalho Docente da aula.
- **CH "meio fixa"**: as cargas horárias (da UC, da aula) têm valor padrão, mas podem ser editadas.
- **Horário e CH na agenda:** a aula guarda **hora inicial e hora final**; a CH que ela abate da UC é a **duração de relógio**
  (fim − início). A **hora-aula** do curso (60 min na maioria, 50 min em alguns) é cadastrada no curso, mas só importa
  para a **chamada** (futuro) — não entra nos cálculos da agenda.
- **Evento avulso** (reunião, viagem, formação, férias…): ocupa a agenda do instrutor, mas **não pertence a turma** nem abate CH de UC.
- **Fonte dos cursos:** o **plano de curso** (PDF). Por UC: nome, CH, **indicadores**, **conhecimentos**, **habilidades**
  e **atitudes e valores**.

## Requisitos da v1
### Interface das TEPTs
- Tela de agenda com **filtro por instrutor ou por turma**.
- Lançamento direto na agenda:
  - Na agenda de um **instrutor** → o formulário pede a **turma**.
  - Na agenda de uma **turma** → o formulário pede o **instrutor**.
  - Em ambos: **UC**, **horário** (início e fim) e **repetição**.
  - **Repetição = mini calendário**: a TEPT marca os dias em que a aula se repete, sempre no mesmo horário.
    O calendário já mostra quais datas estão **livres** e quais estão bloqueadas (conflito de instrutor/turma, limite do RH),
    e pode mostrar quanto da CH da UC as datas marcadas cobrem.
- Também lança **eventos avulsos** na agenda do instrutor (sem turma).
- **Cadastros (só TEPTs):** cursos, UCs, turmas e **instrutores** (a TEPT cria o acesso de um instrutor novo; aula só
  pode ser lançada para instrutor já cadastrado).
- **Leitor de plano de curso com IA:** a TEPT envia o PDF do plano de curso e a IA (Claude API) devolve o curso com
  todas as UCs: nomes, CHs, indicadores, conhecimentos, habilidades, atitudes e valores. A TEPT **revisa e confirma**
  antes de gravar.
- **Verificação de conflito** antes de gravar: dizer se o instrutor e a turma estão livres naquele horário
  (instrutor não pode estar em dois lugares; turma não pode ter duas aulas ao mesmo tempo) e mostrar o motivo quando não pode.
- Inteligência de apoio: **quantas horas faltam para fechar cada UC**, **horários compatíveis** (onde instrutor e turma
  estão livres), **limites do RH** do instrutor, **gráficos** de andamento da UC/turma.

### Interface dos Instrutores
- Mesma base visual, mas a **agenda é maior** (foco em consulta).
- Cada cartão de aula tem **2 ícones marcáveis**: **Material** e **PTD** (só feito / não feito).
- Vê **a própria agenda** e **a agenda das turmas em que dá aula** (não vê a de outros instrutores).
- Vê as próprias horas e o andamento das UCs que leciona. Não cadastra nem lança aulas.

### Regras de domínio da v1 (não quebrar)
- Conflito é bloqueio, não aviso: não gravar aula que choca instrutor ou turma (a TEPT vê o porquê).
  Eventos avulsos também ocupam o instrutor.
- **Regras do RH (por instrutor, tempo de relógio, contando aulas e eventos avulsos de trabalho — reunião, viagem etc.):**
  - no máximo **10 h de trabalho por dia**;
  - **interjornada mínima de 11 h**: do fim da última atividade de um dia ao início da primeira do dia seguinte.
- CH lançada de uma UC numa turma não deve passar da CH da UC sem confirmação explícita.
- Toda alteração continua auditada (quem, quando, antes/depois).
- Instrutor só edita as marcações de material/PTD das próprias aulas; TEPT edita agenda e cadastros. Garantido por RLS.
- Chamadas à Claude API e criação de usuários no Auth precisam de segredo → ficam em **Edge Functions**, nunca no front.

### Plano de curso (entrada do leitor com IA)
Padrão nacional do Senac (mesma estrutura em todos os cursos). Exemplo analisado: Técnico em Informática para Internet, 55 págs.
- **Seção 1 – Identificação:** título, eixo tecnológico, segmento, **CH total** (ex.: 1.000 h), **código DN** (ex.: 2691), CBO.
- **Seção 5 – Organização curricular:** tabela com **UCs numeradas** (UC1…UC16), nome e CH de cada uma.
  - A **soma das UCs = CH total** (validação obrigatória do leitor; no exemplo, 1.000 h fecha).
  - Pode haver **qualificações intermediárias** (certificações por grupos de UCs). São só informativas: **toda turma
    faz o curso completo**, então a v1 não modela qualificações.
- **Seção 5.1 – Detalhamento por UC:** número, nome, CH, **indicadores** (lista numerada), **conhecimentos**
  (itens no formato "Tema: detalhes"), **habilidades**, **atitudes/valores**.
  - A ordem no PDF **não é a numérica** (no exemplo os Projetos Integradores 5, 11 e 16 vêm todos no fim).
  - **Projeto Integrador (PI)** é tratado como **UC normal na agenda** (tem CH e aulas próprias). Não tem
    conhecimentos/habilidades/atitudes próprios: **compartilha os elementos das UCs do seu bloco** (ex.: UC5 ↔ UC1–UC4,
    UC11 ↔ UC6–UC10, UC16 ↔ UC12–UC15). Guardar a UC como tipo `projeto_integrador` + a lista de UCs que ela integra
    + os indicadores de avaliação do PI.
  - Gravar o texto **fiel ao PDF**, mesmo com erros do original (ex.: UC3 indicador 1 fala "back-end"; UC8 tem um valor dentro de habilidades).
- **Não extrair na v1:** justificativa, perfil profissional, orientações metodológicas, avaliação, bibliografia
  (metodologia e bibliografia por UC podem servir aos agentes de PTD no futuro).
- PDFs de exemplo para teste: `D:\SENAC\<curso>\Planejamento\` (Programador Web, Téc. Informática para Internet,
  Téc. Inteligência Artificial, Auxiliar de Confeitaria, Assistente Adm).
- Entrada é **sempre PDF** (o `.docx` do Assistente de TI será convertido antes; o leitor não aceita Word).

### Fora da v1 (futuro — não construir agora, mas não fechar portas)
- Integração com **OneDrive** e **Canva** para material e PTD (o cartão passa a linkar os arquivos).
- **Chamada por aula** com relatório (aqui a hora-aula de 50/60 min passa a importar).
- **Feriados da unidade** como cadastro único que bloqueia todos os instrutores e turmas.
- **Ensalamento inteligente** (labs e salas de aula).
- **Rateio de ponto** conectado ao sistema do SENAC (Senior).
- Agentes externos (Python, Mac mini M4) que leem a agenda: PTDs semanais (Claude API), slides no Canva, rateio.

## Stack e identificadores
| Peça | Valor |
|---|---|
| Banco + Auth | Supabase, projeto `senac-agenda`, ref **`lgdbckmppeaddnhecwix`**, região `sa-east-1`, plano free |
| URL Supabase | `https://lgdbckmppeaddnhecwix.supabase.co` (chave publicável em `.env.production`; é pública, a segurança é o RLS) |
| Front-end | Next.js 16 + React 19, **exportação estática** (`output: 'export'` → pasta `out/`). Sem rotas de servidor, sem middleware, sem server actions. Regra de negócio que precisa de garantia (conflitos, permissões) fica **no banco** (constraints, RLS, funções SQL/RPC) |
| Hospedagem | Firebase Hosting, projeto **`senac-gestao`**, site padrão (`senac-gestao.web.app`) |
| Domínio | `agenda.bryam.com.br` (custom domain no Firebase; DNS controlado pelo Bryam) |
| Repositório | `github.com/BryamFLA/senac-agenda` (privado), branch `main` |
| CI/CD | `.github/workflows/deploy.yml`: job `verificar` (lint + build) → PR: `preview` (canal temporário, 7 dias) · push na `main`: `producao` (canal `live`) |
| Acesso dos agentes | Supabase, Firebase, GitHub etc. via MCP. Supabase CLI **não** instalado |
| Edge Functions (v1) | `usuarios` (cria acesso / troca senha, service role) e `ler-plano` (Claude API `claude-opus-5-5`, saída estruturada, `fallbacks: "default"`). Ambas `verify_jwt: true` e conferem se quem chama é gestor |
| Segredo da IA | `ANTHROPIC_API_KEY` nas secrets das Edge Functions (Supabase → Edge Functions → Secrets) — **o Bryam cadastra** |
| Espelho Google (v0, pausado) | Edge Function `sync-gcal` → agenda "SENAC" de `bryamafl@gmail.com`, conta de serviço `agenda-sync@senac-gestao.iam.gserviceaccount.com` |

Plano free do Supabase pode pausar o projeto após dias sem uso — se o site parar de carregar dados, verificar no painel.

## Estrutura (v1)
```
app/            layout.tsx, page.tsx (sessão, perfil, cadastros, abas por hash #agenda/#painel/#cursos/#turmas/#pessoas), globals.css (todo o estilo)
components/     Contexto.tsx (cadastros compartilhados), Modal.tsx (+ SeletorCor), Login.tsx, NovaSenha.tsx
                Agenda.tsx (filtro instrutor|turma, grade, Material/PTD) · Grade.tsx (vários itens por célula)
                FormItem.tsx (lançar/editar: aula|evento, mini calendário, CH da UC, apagar série) · MiniCalendario.tsx
                DetalheAula.tsx (visão do instrutor: elementos da UC) · Painel.tsx (andamento, carga, pendências)
                Cursos.tsx (+ ElementosUC, edição de UC) · ImportarPlano.tsx (PDF → IA → revisão) · Turmas.tsx · Pessoas.tsx
lib/            supabase.ts, types.ts (tipos, TURNOS, CORES, minutos/fmtMin, mensagemErro), datas.ts,
                plano.ts (corta o texto do plano em partes — função pura), pdf.ts (pdf.js no navegador)
supabase/migrations/   SQL versionado — nomes batem com as versões aplicadas no remoto
supabase/functions/    usuarios/, ler-plano/ (v1) · sync-gcal/ (v0, pausado; testes: cd lá e `npx -y deno@2.9.6 test`)
scripts/testar_plano.mjs  confere a segmentação contra PDFs reais:
                          `node --experimental-strip-types scripts/testar_plano.mjs "<plano.pdf>"`
scripts/import_excel.py   importação única da planilha (v0, já executada; não rodar de novo)
docs/superpowers/      desenhos (specs/) e planos (plans/)
```

## Banco (schema `public`)
### v1 (migrações `20261008172403_v1_schema` e `20261008172438_v1_importar_v0`)
- **`usuarios`** — `id` = `auth.users.id`, `email`, `nome`, `papel` (`admin` | `tept` | `instrutor`), `leciona` (aparece como
  instrutor), `cor` (pinta as aulas na agenda da turma), `ativo`. Gestor = admin ou tept. Bryam = admin + leciona.
  Novo acesso: pela tela Pessoas (Edge Function `usuarios`); só admin cria/edita admin.
- **`cursos`** (`ch_total`, `hora_aula_min` 60|50, `codigo_dn`, `cbo`, `ativo`) → **`ucs`** (`numero` único no curso, `nome`,
  `ch`, `tipo` regular|projeto_integrador, `indicadores[]`, `conhecimentos[]`, `habilidades[]`, `atitudes[]`, `integra[]`).
- **`turmas`** — `curso_id`, `codigo` (9 dígitos, único, opcional), `nome`, `cor`, datas, `ativo`.
- **`itens`** — cada item da agenda: `tipo` aula|evento, `data`, `hora_inicio`/`hora_fim` (obrigatórios), `turno` (coluna
  gerada pelo início: <12h M, <18h T, senão N), `periodo` (tsrange gerado), `instrutor_id`, `turma_id`+`uc_id` (aula),
  `titulo`+`cor`+`trabalho` (evento), `observacao`, `material_ok`, `ptd_ok`, `serie_id` (lançados juntos), `origem` v1|v0.
- **`historico`** — auditoria de `itens` (trigger `itens_audit`). View **`progresso`** (security_invoker): horas agendadas e
  realizadas por turma × UC.
- **Regras no banco:** exclusion constraints `itens_sem_choque_instrutor` / `itens_sem_choque_turma` (btree_gist);
  trigger `itens_validar` (coerência + choque com mensagem em português); constraint trigger **diferido** `itens_jornada`
  (10 h/dia e 11 h de interjornada, só itens `trabalho`). Tudo em `private.motivo_bloqueio()` / `private.motivo_jornada()`.
  `app.ignorar_regras = on` (set_config local) desliga as regras — usado **só** na importação da v0.
- **RPCs:** `disponibilidade(datas[], ini, fim, instrutor, tipo, turma, uc, trabalho, ignorar)` → motivo por data (gestor);
  `marcar_item(id, 'material'|'ptd', bool)` (dono da aula ou gestor); `salvar_curso(json)` (curso + UCs numa transação).
- **RLS:** `private.papel()/e_gestor()/e_usuario()`. Gestor lê/escreve tudo. Instrutor lê os próprios itens + aulas das
  turmas em que dá aula (`private.minhas_turmas()`), não escreve direto (só via `marcar_item`). Sem cadastro ativo: nada.
- **Dados da v0:** os 535 registros viraram **eventos do Bryam com `origem = 'v0'`** (selo "v0" no cartão; feriado/férias/
  folga com `trabalho = false`). A TEPT converte em aula pela edição (Evento → Aula + turma + UC).

### v0 (legado, não usado pela v1)
`agenda`, `compromissos`, `editores`, `agenda_historico` continuam no banco, intactas (o site da v0 ainda lê delas até o merge).
Depois da virada podem virar somente leitura; não apagar sem o Bryam pedir.

## Convenções
- **Turnos:** Manhã 08:00–12:00 · Tarde 13:30–17:30 · Noite 19:00–22:00 (horário padrão; a aula pode ter horário próprio).
  Evento "dia todo" = 08:00–22:00. Férias/folga/feriado = evento com `trabalho = false` (ocupa, não conta jornada).
- Datas sempre como string local `YYYY-MM-DD` (nada de `toISOString()` — fuso `America/Sao_Paulo`).
- **Nunca apagar registro com histórico ligado** — desativar (`ativo = false`). FKs bloqueiam apagar UC/turma com aulas.
- Cartão pintado via CSS `--c` + `color-mix`: na agenda do instrutor, cor da **turma**; na da turma, cor do **instrutor**.
- Erros do banco chegam à tela por `mensagemErro()` (`lib/types.ts`): as funções levantam mensagens prontas em português.
- `next.config.mjs` tem `agentRules: false`: o `next dev` 16.3 reescreve o `CLAUDE.md` sem isso.
- CSS: a classe `.marca` é do logo do topo; os botões Material/PTD usam `.marcacao`.
- **Interface:** tema **somente claro**, identidade SENAC (Manual da Marca): azul `#004A8D` (Pantone 288 C) e
  laranja `#F7941D` (Pantone 144 C). Azul = ações e títulos; laranja = "hoje"/foco. Fonte Inter, base 16px, visual limpo.
  Grade: semanas empilhadas (SEG–SÁB × Manhã/Tarde/Noite), como a planilha antiga.

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
- Automático: secret `FIREBASE_SERVICE_ACCOUNT_SENAC_GESTAO` no GitHub (já configurado). Manter só `deploy.yml`.
- O build é feito uma vez no job `verificar` e o mesmo `out/` (artefato) é publicado.
- **Previews de PR usam o banco de produção**: editar dados num preview altera a agenda real. Cuidado redobrado
  durante a v1 — migrações destrutivas exigem backup/conferência antes.
- Migrações do Supabase são **manuais** (via MCP `apply_migration`); a esteira cobre só o front. `main` sem proteção de branch.
  Todo SQL aplicado no remoto também vira arquivo em `supabase/migrations/` com a mesma versão.
- Edge Functions: MCP `deploy_edge_function` com **`import_map_path: "deno.json"`**; `usuarios` e `ler-plano` com
  `verify_jwt: true`. Checar antes com `npx -y deno@2.9.6 check index.ts` dentro da pasta da função.
- Testar regras do banco sem sujar produção: bloco `do $$ … raise exception 'RESULTADO: %' … $$` (o erro final desfaz tudo);
  simular papel com `set_config('request.jwt.claims', '{"sub":"<uuid>"}', true)` + `set local role authenticated`.

## Espelho no Google Calendar (v0 — PAUSADO desde 06/10/2026)
- Pausado para a reestruturação: trigger `agenda_sync_gcal` desligado e job `sync-gcal-conferir` inativo
  (migração `20261006095826_pausar_sync_gcal`, que traz os comandos para reativar). Eventos já criados continuam no Google.
- Como funcionava: trigger (pg_net) envia `{id}` a cada mudança em `agenda`; a função relê e faz upsert
  (ID do evento = `agenda.id` sem hífens). Feriado/férias não vão ao Google. Conferência diária 06:00 UTC, só do dia corrente em diante.
- Segredos da função: `GOOGLE_SERVICE_ACCOUNT_JSON`, `GCAL_CALENDAR_ID`, `SYNC_SECRET` (igual ao Vault `sync_gcal_secret`).
- Deploy da função: MCP `deploy_edge_function` com `verify_jwt: false` **e `import_map_path: "deno.json"`**.
- `supabase/functions` fica fora do `tsconfig.json` do Next (é Deno).
- **Na v1:** decidir se volta (provavelmente por instrutor, apontando para o modelo novo de aulas) ou se é aposentado.
- Recuperação de senha por e-mail não é confiável (Supabase sem SMTP próprio); o Bryam redefine senhas pelo painel.

## Status da v1 (08/10/2026)
- [x] Banco, regras (choque, 10 h/dia, 11 h), RLS por papel, histórico, RPCs — testados com blocos SQL que desfazem tudo
- [x] Importação da v0 (535 itens como eventos `origem v0`, 3 usuários)
- [x] Telas: agenda TEPT (filtro, lançamento com mini calendário, livres por turno, CH da UC, edição/série), agenda do
      instrutor (Material/PTD, detalhe com elementos da UC, agenda das turmas), painel, cursos/UCs, turmas, pessoas
- [x] Edge Functions `usuarios` e `ler-plano` publicadas; segmentação do PDF conferida com 5 planos reais
- [x] Testado no navegador (Edge + Playwright, dev server) com usuário de teste: cadastros, lançamento, bloqueios,
      instrutor, criação de acesso, importação até a chamada da IA
- [ ] `ANTHROPIC_API_KEY` nas secrets (sem ela o leitor de PDF responde "não configurada"); primeira leitura real de um plano
- [ ] Merge na `main` = virada do site para as coordenadoras

## Próximas etapas (em ordem)
1. Bryam cadastra `ANTHROPIC_API_KEY`, testa a importação de um plano e revisa a v1 no preview do PR.
2. Merge na `main` (virada). Avisar as coordenadoras: eventos "v0" são a agenda antiga e podem ser convertidos em aula.
3. Decidir o destino do espelho no Google Calendar (hoje lê a tabela `agenda` da v0).

## Decisões já tomadas (out/2026)
- Limite do RH é **diário** (10 h/dia) + **interjornada de 11 h**, não semanal/mensal.
- Repetição por **mini calendário** com dias livres/bloqueados; mesmo horário em todos os dias marcados.
- Agenda e CH usam **tempo de relógio** (início/fim). Hora-aula (60/50 min) fica no curso, só para a chamada futura.
- Limite de 10 h/dia conta aulas + reuniões, viagens e demais eventos de trabalho.
- Eventos avulsos ocupam a agenda do instrutor sem turma.
- Só TEPTs cadastram cursos, UCs, turmas e instrutores. Aula só para instrutor cadastrado.
- Cursos e UCs entram pelo **leitor de plano de curso com IA** (PDF → revisão da TEPT → banco).
- Material e PTD na v1: só feito / não feito.
- Instrutor vê a própria agenda + a das turmas em que dá aula.
- Feriado da unidade e relatórios externos: fora da v1.
- Toda turma faz o curso completo (sem turma de qualificação intermediária).
- Projeto Integrador = UC com aulas próprias na agenda; compartilha os elementos das UCs do bloco.
- Leitor de plano de curso aceita só PDF.

## Pendências para confirmar com o Bryam
- Dados de teste ainda no banco de produção (a limpeza foi recusada na sessão de 08/10): usuários
  `teste.v1@senac-agenda.test` e `teste.inst@senac-agenda.test`, curso "TESTE Curso v1", turma "TESTE Turma v1" e 3 aulas
  em mar/2027. Apagar quando o Bryam autorizar (itens → historico desses itens → turma → curso → usuarios → auth.users).

## Contexto externo
- Arquivos do SENAC: `D:\SENAC` (clone do OneDrive institucional; estrutura Curso → Turma → UC).
  Planos de curso em `D:\SENAC\<curso>\Planejamento\`; turmas em pastas `<curso> - <código da turma>`.
- Notion: página "Arquitetura - Notion OS" e base "Cursos & Turmas" descrevem a organização geral; a agenda **não** vive no Notion.
