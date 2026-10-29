# CLAUDE.md — senac-agenda

Contexto para agentes (Claude Code) trabalharem neste repositório. Leia inteiro antes de mudar algo.

> **Momento do projeto (15/10/2026):** a **v1** (distribuição de aulas e carga horária para a unidade inteira, com
> interfaces de TEPTs e Instrutores) está **em produção** em `agenda.bryam.com.br` (PR #2 mesclado na `main`).
> As tabelas da v0 continuam no banco, intactas, só como legado. Desenho: `docs/superpowers/specs/2026-10-08-v1-design.md`.

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
- **Aluno** → cadastro único (nome, e-mail institucional, CodAluno do Senac). Existe sem turma e entra em uma ou mais
  turmas depois (**matrícula**, com situação Normal ou Desligado/evadido).
- **Chamada** → por **hora-aula**: uma presença por hora-aula da aula (C = compareceu, F = faltou). Aula de 4 h com
  hora-aula de 60 min = 4 presenças. Quantidade = duração ÷ hora-aula do curso, arredondada, mínimo 1.
- **Local** → sala/laboratório onde a aula acontece (cadastro simples: Sala 1…6, laboratórios, Cozinha Pedagógica,
  Auditório, Biblioteca). Cada item da agenda tem um local cadastrado **ou** um "outro local" em texto livre (ou nenhum).
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
- **Choque de horário é aviso, não bloqueio** (decisão de 15/10): dá para gravar dois itens sobrepostos (instrutor ou
  turma), mas a TEPT é avisada **antes** (nome em vermelho na lista, data em vermelho no calendário, caixa de aviso com
  confirmação) e **depois** (cartão vermelho com ⚠ na agenda, card "Conflitos de horário" no painel).
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

### Locais (29/10/2026)
- Cadastro **Locais** (menu, só TEPTs): nome, ordem nas listas, ativo. Os 13 locais da unidade já vêm cadastrados.
- Agenda tem um terceiro filtro, **Locais**: a agenda de uma sala mostra tudo que está reservado nela (para todos os usuários).
- **TEPT**: escolhe o local no formulário de lançamento (lista com ocupados em vermelho; "Outro local (digitar)").
  Choque de local é **aviso** (mesmo esquema de instrutor/turma: calendário, confirmação, cartão vermelho, painel).
  Na agenda de um local, o lançamento já vem com o local marcado e pede instrutor e turma.
- **Instrutor**: vê a agenda de qualquer local e **reserva** o local para os **próprios** itens — na agenda do local
  (célula sem item de outra pessoa → escolhe a aula dele nesse turno) ou no detalhe da aula ("Definir local"/"Trocar").
  Se outra pessoa já estiver no local nesse horário, o banco **bloqueia** (`definir_local`). Item de outra pessoa: só leitura.
- O cartão mostra o local (⌖) nas agendas de instrutor e turma.

### Chamada (29/10/2026) — **ESCONDIDA nesta versão**
> O Bryam decidiu que a chamada **não entra agora**. Tudo continua no código e no banco, mas a interface está desligada
> pela chave **`CHAMADA_ATIVA = false`** em `lib/types.ts` (some o menu Alunos, a seção de alunos na turma e o botão
> Chamada no cartão). Para religar: trocar para `true`. Não apagar as tabelas `alunos`, `matriculas`, `presencas`.

- Cadastro de **alunos** (tela Alunos, só TEPTs) e alunos da turma no **cadastro da turma** (busca + "cadastrar novo";
  cada mudança grava na hora; aluno com chamada não sai da turma, vira "Desligado").
- Botão **"Importar lista de frequência (PDF)"** na turma: lê a consulta **"Usuários AD"** do sistema do Senac
  (colunas UEPT, TurCod, AlunoCod, Aluno, UsuarioAD…; o nome vem quebrado em várias linhas entre o código e o e-mail).
  Leitura em `lib/frequencia.ts` (função pura; conferir com `node --experimental-strip-types scripts/testar_frequencia.mjs "<lista.pdf>"`).
  Mostra uma **prévia** antes de gravar: *Novo cadastro* (cadastra e põe na turma), *Já cadastrado* (achado pelo código
  ou pelo e-mail: só entra na turma) e *Já na turma*. Cadastro existente é **mantido** (diferenças só aparecem como aviso);
  o PDF só **completa** código/e-mail vazios. TurCod diferente da turma aberta → aviso + confirmação obrigatória.
- A chamada abre pelo **cartão da aula na agenda** (terceiro botão, ao lado de Material/PTD): laranja = aula de hoje ou
  passada sem chamada; verde = feita; apagado = aula futura (a chamada abre no dia da aula).
- Grava o **instrutor da aula** ou a coordenação. Desligado aparece em laranja e começa com falta; aluno normal começa presente.
- Cabeçalho de cada hora marca/desmarca a turma toda; ⇄ inverte a linha do aluno. Coluna "Faltas" = total na turma.

### Fora da v1 (futuro — não construir agora, mas não fechar portas)
- Integração com **OneDrive** e **Canva** para material e PTD (o cartão passa a linkar os arquivos).
- **Relatório de frequência** (a chamada já existe; falta o relatório).
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
app/            layout.tsx, page.tsx (sessão, perfil, cadastros; **sem topo**: menu lateral com logo, seções por hash
                #agenda/#painel/#cursos/#turmas/#pessoas e, embaixo, usuário + Sair), globals.css (todo o estilo)
components/     Contexto.tsx (cadastros compartilhados), Modal.tsx (+ SeletorCor), Icone.tsx (ícones do menu), Login.tsx, NovaSenha.tsx
                Agenda.tsx (mês, filtro à direita compartilhado, botão + flutuante para comparar até 2 agendas, nomes com
                conflito em vermelho) · AgendaColuna.tsx (uma agenda: grade, Material/PTD, lançamento/edição) · Grade.tsx (vários itens por célula)
                FormItem.tsx (lançar/editar: aula|evento, mini calendário, CH da UC, avisos de conflito, apagar série)
                ListaEscolha.tsx (lista de instrutores/turmas com ocupados em vermelho) · MiniCalendario.tsx
                DetalheAula.tsx (visão do instrutor: elementos da UC)
                Painel.tsx (dashboard: filtros fixos + indicadores) · painel/ (Conflitos, Andamento, Fechamento, Carga,
                Preparo, Matriz; dados.ts = cálculos; Partes.tsx = Secao/Kpi/Medidor/Selo; Dica.tsx = tooltip)
                Cursos.tsx (+ ElementosUC, edição de UC) · ImportarPlano.tsx (PDF → IA → revisão) · Turmas.tsx · Pessoas.tsx
                Filtros.tsx (barra de busca + filtros das telas de cadastro: Busca, Filtro, SITUACOES)
                Alunos.tsx (tela de alunos + EditarAluno) · AlunosTurma.tsx (alunos dentro do cadastro da turma, importação do PDF)
                Chamada.tsx (chamada por hora-aula, aberta pelo cartão da aula)
                Locais.tsx (cadastro de locais) · ReservarLocal.tsx (instrutor reserva local; LocalDoItem no detalhe da aula)
lib/            supabase.ts (+ buscarTodos: pagina de 1000 em 1000), types.ts (tipos, TURNOS, CORES, minutos/fmtMin, mensagemErro), datas.ts,
                plano.ts (corta o texto do plano em partes — função pura), pdf.ts (pdf.js no navegador),
                frequencia.ts (lê a lista "Usuários AD" do Senac — função pura)
supabase/migrations/   SQL versionado — nomes batem com as versões aplicadas no remoto
supabase/functions/    usuarios/, ler-plano/ (v1) · sync-gcal/ (v0, pausado; testes: cd lá e `npx -y deno@2.9.6 test`)
scripts/testar_plano.mjs  confere a segmentação contra PDFs reais:
                          `node --experimental-strip-types scripts/testar_plano.mjs "<plano.pdf>"`
scripts/import_excel.py   importação única da planilha (v0, já executada; não rodar de novo)
docs/superpowers/      desenhos (specs/) e planos (plans/)
```

## Banco (schema `public`)
### v1 (migrações `20261008172403_v1_schema`, `20261008172438_v1_importar_v0`, `20261015133617_v1_livres_no_horario`, `20261015135258_v1_conflitos_funcoes`, `20261015140134_v1_ocorrencias_periodo`, `20261015163907_v1_andamento_view`)
- **`usuarios`** — `id` = `auth.users.id`, `email`, `nome`, `papel` (`admin` | `tept` | `instrutor`), `leciona` (aparece como
  instrutor), `cor` (pinta as aulas na agenda da turma), `ativo`. Gestor = admin ou tept. Bryam = admin + leciona.
  Novo acesso: pela tela Pessoas (Edge Function `usuarios`); só admin cria/edita admin.
- **`cursos`** (`ch_total`, `hora_aula_min` 60|50, `codigo_dn`, `cbo`, `ativo`) → **`ucs`** (`numero` único no curso, `nome`,
  `ch`, `tipo` regular|projeto_integrador, `indicadores[]`, `conhecimentos[]`, `habilidades[]`, `atitudes[]`, `integra[]`).
- **`turmas`** — `curso_id`, `codigo` (9 dígitos, único; obrigatório na tela), `nome`, `cor`, datas, `ativo`.
  A turma **não tem nome próprio**: `nome` é gerado como "código · curso" (`nomeAutomatico` em `Turmas.tsx`) e é
  regravado quando o curso é renomeado. Nas listas aparece o código com o curso embaixo.
- **`itens`** — cada item da agenda: `tipo` aula|evento, `data`, `hora_inicio`/`hora_fim` (obrigatórios), `turno` (coluna
  gerada pelo início: <12h M, <18h T, senão N), `periodo` (tsrange gerado), `instrutor_id`, `turma_id`+`uc_id` (aula),
  `titulo`+`cor`+`trabalho` (evento), `observacao`, `material_ok`, `ptd_ok`, `serie_id` (lançados juntos), `origem` v1|v0.
- **`historico`** — auditoria de `itens` (trigger `itens_audit`). Views (security_invoker): **`progresso`** (horas por
  turma × UC) e **`andamento`** (turma × UC × instrutor: horas, primeira/última/próxima aula, aulas futuras, material e PTD
  pendentes) — base do painel.
- **Regras no banco:** trigger `itens_validar` (coerência da aula, mensagem em português) e constraint trigger
  **diferido** `itens_jornada` (10 h/dia pela **união** dos horários e 11 h de interjornada, só itens `trabalho`) —
  esses **bloqueiam**. Choque de horário **não bloqueia**: `private.motivo_conflito()` só gera o aviso.
  Funções: `private.motivo_bloqueio()` (coerência + RH), `private.motivo_jornada()`, `private.motivo_conflito()`.
  As exclusion constraints antigas `itens_sem_choque_*` são removidas por `supabase/manual/2026-10-15_remover_travas_de_choque.sql`
  (rodado à mão no SQL Editor; o MCP recusa `drop`).
  `app.ignorar_regras = on` (set_config local) desliga as regras — usado **só** na importação da v0.
- **RPCs:** `disponibilidade_datas(datas[], ini, fim, instrutor, tipo, turma, uc, trabalho, ignorar)` → por data,
  `motivo` (bloqueio) e `conflito` (aviso) — mini calendário (gestor); `ocupacao_no_horario(data, ini, fim, ignorar)` →
  o mesmo por instrutor e por turma — listas do formulário (gestor); `conflitos_periodo(ini, fim)` → conflitos já gravados
  (painel; filtra o que quem chama pode ver); `ocorrencias_periodo(ini, fim)` → o mesmo com `instrutor_id`/`turma_id`
  (cartões vermelhos e nomes em vermelho no filtro da agenda); `marcar_item(id, 'material'|'ptd', bool)` (dono da aula
  ou gestor); `salvar_curso(json)` (curso + UCs numa transação).
- **RLS:** `private.papel()/e_gestor()/e_usuario()`. Gestor lê/escreve tudo. Instrutor lê os próprios itens + aulas das
  turmas em que dá aula (`private.minhas_turmas()`), não escreve direto (só via `marcar_item`). Sem cadastro ativo: nada.
- **Dados da v0:** os 535 registros viraram **eventos do Bryam com `origem = 'v0'`** (selo "v0" no cartão; feriado/férias/
  folga com `trabalho = false`). A TEPT converte em aula pela edição (Evento → Aula + turma + UC).

### Chamada (`supabase/manual/2026-10-29_chamada.sql`, rodado à mão pelo Bryam no SQL Editor em 29/10 — o MCP estava desconectado)
- **`alunos`** (`nome`, `email` único opcional, `codigo` = CodAluno único opcional, `ativo`) · **`matriculas`** (PK
  `turma_id`+`aluno_id`, `situacao` normal|desligado) · **`presencas`** (PK `item_id`+`aluno_id`, `horas boolean[]`,
  uma posição por hora-aula; FK **sem cascade**: aula com chamada não pode ser apagada).
- `private.horas_chamada(ini, fim, hora_aula)` (mesma conta de `horasChamada()` em `lib/types.ts`).
- RPC **`salvar_chamada(item, registros jsonb)`**: dono da aula ou gestor; só a partir do dia da aula; só alunos
  matriculados; nº de horas tem de bater. Escrita em `presencas` só por ela (sem policy de insert/update).
- Trigger `presencas_audit` grava no mesmo `historico` da aula (antes/depois com `aluno_id`).
- Views (security_invoker): **`chamadas`** (por aula: alunos, horas, faltas, feita_em) e **`frequencia`** (turma × aluno:
  aulas, horas, faltas).
- RLS: gestor tudo; instrutor lê alunos/matrículas das turmas em que dá aula e as presenças das aulas que vê.
- Testado em PGlite (Postgres em memória) com o schema da v1: permissões por papel, validações, auditoria, views.

### Locais (`supabase/manual/2026-10-29_locais.sql`, rodado à mão no SQL Editor)
- **`locais`** (`nome` único, `ordem`, `ativo`; RLS: todos leem, gestor escreve) · `itens.local_id` (FK) e
  `itens.local_outro` (texto), constraint `itens_um_local` (não os dois). Índice gist `(local_id, periodo)`.
- `private.conflito_local()` (aviso). `disponibilidade_datas` ganhou `p_local` (recriada); `ocupacao_no_horario` devolve
  também `tipo = 'local'`; `conflitos_periodo` e `ocorrencias_periodo` (recriada, nova coluna `local_id`) contam choque de local.
- RPC **`agenda_local(local, ini, fim)`** (security definer: qualquer usuário vê as reservas do local) e
  **`definir_local(item, local, outro)`**: gestor livre; instrutor só nos próprios itens e só com o local vazio.
- Testado em PGlite com todas as migrações da v1 aplicadas na ordem.

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
- `next.config.mjs` tem `agentRules: false` (o `next dev` 16.3 reescreve o `CLAUDE.md` sem isso) e `devIndicators: false`.
- Telas de cadastro: largura total, barra de filtros no topo (busca + filtros + contador). Cursos: eixo, segmento,
  situação. Turmas: curso, situação. Pessoas: papel, dá aula, situação.
- CSS: a classe `.marca` é do logo; os botões Material/PTD usam `.marcacao`.
- Painel (dashboard): segue a skill `dataviz` — filtros numa linha fixa no topo valendo para todas as seções; cores com
  função única (azul SENAC realizado, `#86b6ef` agendado, trilho cinza; rampas azuis ordinais a partir do degrau 250,
  validadas com o script da skill; status bom/atenção/sério/crítico só com ícone + texto); tooltip em toda marca e
  "Ver tabela" nos gráficos. Seções: conflitos (destaque), andamento por turma/UC, fechamento (linha do tempo + previsão),
  carga (mapa de calor instrutor × dia), material/PTD, matriz instrutor × turma.
- Comparar agendas: o botão + (canto inferior direito) abre a 2ª agenda; o filtro é um só e vale para a agenda **ativa**
  (contorno azul, número 1/2); o mês é o mesmo nas duas; gravar em uma recarrega as duas. Comparando, o menu lateral
  recolhe (`.app:has(.agenda-layout.comparando)`) e a grade fica compacta (`.semanas.compacto`).
- Layout: não há topo; o título de cada página é o `h1` (30px). Menu lateral de 236px vira só ícones abaixo de 1440px
  e gaveta (barra mínima com ☰ só no celular) abaixo de 900px; o filtro da agenda
  fica à direita (264px) e sobe para cima da grade abaixo de 1200px. A grade tem largura mínima de 788px.
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
- [x] Merge na `main` (15/10/2026) — v1 no ar para as coordenadoras

## Próximas etapas (em ordem)
1. Bryam cadastra `ANTHROPIC_API_KEY` e testa a importação de um plano de curso real.
2. Avisar as coordenadoras: eventos "v0" são a agenda antiga e podem ser convertidos em aula; cadastrar cursos e turmas reais.
3. Decidir o destino do espelho no Google Calendar (hoje lê a tabela `agenda` da v0).

## Decisões já tomadas (out/2026)
- Limite do RH é **diário** (10 h/dia) + **interjornada de 11 h**, não semanal/mensal.
- Repetição por **mini calendário** com dias livres/bloqueados; mesmo horário em todos os dias marcados.
- Agenda e CH usam **tempo de relógio** (início/fim). Hora-aula (60/50 min) fica no curso, só para a chamada futura.
- Limite de 10 h/dia conta aulas + reuniões, viagens e demais eventos de trabalho (horários sobrepostos contam uma vez).
- Choque de horário (instrutor ou turma) é permitido com aviso antes e depois; RH continua bloqueando.
- Eventos avulsos ocupam a agenda do instrutor sem turma.
- Só TEPTs cadastram cursos, UCs, turmas e instrutores. Aula só para instrutor cadastrado.
- Cursos e UCs entram pelo **leitor de plano de curso com IA** (PDF → revisão da TEPT → banco).
- Material e PTD na v1: só feito / não feito.
- Instrutor vê a própria agenda + a das turmas em que dá aula.
- Feriado da unidade e relatórios externos: fora da v1.
- Toda turma faz o curso completo (sem turma de qualificação intermediária).
- Projeto Integrador = UC com aulas próprias na agenda; compartilha os elementos das UCs do bloco.
- Leitor de plano de curso aceita só PDF.
- Chamada por hora-aula, aberta pelo cartão da agenda; aluno é cadastro único, ligado à turma por matrícula (29/10).
- Local da aula: cadastro simples + "outro local" em texto. Choque de local é aviso para a TEPT e bloqueio para o
  instrutor, que só reserva local vazio para as próprias aulas (29/10).

## Pendências para confirmar com o Bryam
- **Rodar `supabase/manual/2026-10-29_locais.sql` no SQL Editor antes de mesclar o PR dos locais** (sem ele a agenda
  não carrega: o front pede `local_id`/`local_outro` e a lista de locais).
- Hora-aula de 50 min: 19:00–22:00 dá 3,6 → **4 presenças** (arredondado). Confirmar se é assim no Senac.
- Limpeza dos dados de teste: SQL em `supabase/manual/2026-10-15_limpar_dados_de_teste.sql` (rodado à mão pelo Bryam;
  conferir se não sobrou usuário `@senac-agenda.test` nem curso/turma "TESTE").

## Contexto externo
- Arquivos do SENAC: `D:\SENAC` (clone do OneDrive institucional; estrutura Curso → Turma → UC).
  Planos de curso em `D:\SENAC\<curso>\Planejamento\`; turmas em pastas `<curso> - <código da turma>`.
- Notion: página "Arquitetura - Notion OS" e base "Cursos & Turmas" descrevem a organização geral; a agenda **não** vive no Notion.
