# Espelho da agenda no Google Calendar — desenho

Data: 2026-10-05 · Status: aprovado em conversa, aguardando revisão do documento

## Objetivo
Toda alteração na tabela `agenda` (Supabase) aparece em segundos numa agenda dedicada "SENAC" no Google Calendar
do Bryam (`bryamafl@gmail.com`). O banco é a fonte da verdade; o Google é espelho e nunca é editado à mão.

## Decisões tomadas
| Tema | Decisão |
|---|---|
| Agenda de destino | Nova agenda secundária "SENAC" na conta `bryamafl@gmail.com`, usada só pelo espelho |
| Autenticação | Conta de serviço `agenda-sync` no projeto Google Cloud `senac-gestao`, com a agenda compartilhada com ela ("Fazer alterações nos eventos"). Sem OAuth de usuário |
| Gatilho | Trigger no banco (`pg_net`) chama a Edge Function a cada INSERT/UPDATE/DELETE em `agenda` |
| Rede de segurança | Conferência diária às 03:00 (Brasília) via `pg_cron`. Sem fila |
| Estratégia de sincronização | O disparo envia só o `id`; a função relê o registro e faz upsert idempotente com ID de evento determinístico |
| Período | Disparo em tempo real: qualquer data. Conferência: só do dia corrente em diante; o passado no Google não é tocado |
| Carga inicial | É a primeira conferência (≈125 registros de 05/10/2026 em diante) |
| Cor | Todos os eventos vermelhos (`colorId: "11"`, Tomate) — no Google a cor separa entidades, não eventos |
| Lembretes | `useDefault`: os padrões configurados na própria agenda "SENAC" |
| Eventos manuais do SENAC na agenda principal | Encerrar as ocorrências futuras depois que o espelho for validado, com confirmação do Bryam série a série |

## Arquitetura
```
site (coordenadoras) ──► agenda (INSERT/UPDATE/DELETE)
                              │ trigger private.agenda_sync_gcal → net.http_post {id}
                              ▼
                     Edge Function sync-gcal ──► relê agenda + compromisso (chave de serviço)
                              ▲                  └─► Google Calendar API (agenda "SENAC")
                              │ pg_cron 06:00 UTC = 03:00 BRT → {conferir: true}
```

### Componentes
- **`supabase/functions/sync-gcal/`** (Deno, `verify_jwt = false`, protegida por header `x-sync-secret`)
  - `index.ts` — rota HTTP: valida o segredo e despacha para `sincronizarRegistro(id)` ou `conferir({ simular })`.
    Responde `202` e continua em segundo plano (`EdgeRuntime.waitUntil`), exceto na simulação, que responde o resultado.
  - `evento.ts` — **função pura** `eventoPara(registro, compromisso)` → corpo do evento do Google; `eventIdPara(agendaId)`.
  - `google.ts` — token da conta de serviço (JWT RS256 com `npm:jose`, escopo `calendar.events`) e chamadas
    `get/insert/update/delete/list` da API de eventos.
  - `conferir.ts` — **função pura** `planejar(registros, eventos)` → listas `criar`, `atualizar`, `apagar`;
    e a aplicação do plano.
  - `turnos.ts` — cópia dos horários de turno de `lib/types.ts` (Deno não importa o código do Next), usada quando só há início.
- **Migração SQL** (aplicada no remoto e salva em `supabase/migrations/` com a mesma versão):
  - extensões `pg_net` e `pg_cron`;
  - segredo `sync_gcal_secret` no Vault;
  - função `private.agenda_sync_gcal()` + trigger `agenda_sync_gcal` AFTER INSERT/UPDATE/DELETE em `agenda`;
  - job `pg_cron` `sync-gcal-conferir` às `0 6 * * *` (UTC).

## Comportamento

### Formato do evento
| Campo | Valor |
|---|---|
| `id` | `agenda.id` sem hífens (32 caracteres hex — válido no alfabeto base32hex do Google) |
| `summary` | `compromissos.nome` |
| `description` | subtítulo; observação (se houver); linha "Gerado por agenda.bryam.com.br — não edite aqui, alterações são sobrescritas." |
| `start`/`end` | `hora_inicio`/`hora_fim` com `timeZone: America/Sao_Paulo`. Ambos nulos → dia inteiro (`date` = data, `end.date` = data + 1). Só início → fim = fim do turno |
| `colorId` | `"11"` |
| `reminders` | `{ useDefault: true }` |
| `extendedProperties.private.agenda_id` | `agenda.id` |

### Sincronizar um registro (disparo)
1. Busca `agenda` + `compromissos` pelo `id` com a chave de serviço.
2. Registro não existe → `events.delete(eventId)`; 404/410 são sucesso.
3. Registro existe → `events.update(eventId, corpo com status confirmed)`; se 404 → `events.insert` com o `id` fixo.
   (`update` também restaura um evento apagado antes, que no Google continua existindo como cancelado e daria 409 no insert.)
4. Se `agenda.gcal_event_id` difere do `eventId`, grava. O trigger de sincronização e o de auditoria ignoram updates
   que só mudam `gcal_event_id`/`updated_*`, então não há laço.

### Conferência (diária e manual)
1. "Hoje" = data atual em `America/Sao_Paulo`.
2. Lê os registros com `data >= hoje` e os eventos da agenda "SENAC" com início em hoje ou depois (`singleEvents`, sem apagados).
3. `planejar`: registro sem evento → criar; evento com título/descrição/horário/cor diferentes do esperado → atualizar;
   evento sem registro correspondente → apagar.
4. `simular: true` devolve o plano (contagens + itens) sem tocar no Google. Senão aplica, em sequência, e devolve o resumo.
5. Também corrige o que o disparo não cobre: compromisso renomeado, subtítulo alterado, falhas de chamada.

### Erros
- Falha no Google durante o disparo: registrada no log da função; a conferência da madrugada corrige. `pg_net` não reenvia.
- Header `x-sync-secret` ausente ou errado → `401`.
- Corpo inválido → `400`.
- O token do Google é obtido a cada execução (vale 1 h; não há cache entre execuções).

## Segredos
| Onde | Nome | Conteúdo |
|---|---|---|
| Edge Function secrets | `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON da chave da conta de serviço |
| Edge Function secrets | `GCAL_CALENDAR_ID` | ID da agenda "SENAC" |
| Edge Function secrets | `SYNC_SECRET` | senha aleatória gerada no setup |
| Vault | `sync_gcal_secret` | a mesma senha, lida pelo trigger e pelo cron |

Nada disso vai para o repositório. O arquivo JSON baixado é apagado após colar no Supabase.

## Testes
- Unitários em Deno (`deno test`):
  - `eventoPara` — turno normal; Técnico IA 12:15–17:15; dia inteiro; só início; observação + subtítulo; sem subtítulo.
  - `eventIdPara` — formato válido.
  - `planejar` — criar, atualizar (cada campo comparado), apagar, nada a fazer.
- Integração manual:
  1. conferência em simulação → conferir contagem (~125 a criar, 0 a apagar);
  2. conferência real → comparar 2–3 dias da agenda "SENAC" com o site;
  3. editar uma célula no site → evento muda em segundos → desfazer;
  4. apagar e recriar uma célula → evento some e volta.

## Fora do escopo
- Sincronização Google → banco (o Google é só espelho).
- Fila/reprocessamento além da conferência diária.
- Corrigir eventos passados no Google.
- Disparo por alteração em `compromissos` (coberto pela conferência).
- E-mail de recuperação de senha / SMTP.

## Entrada no ar
1. Bryam: Google Cloud (API + conta de serviço + chave), agenda "SENAC" compartilhada, segredos no Supabase.
2. Deploy da função; migração (extensões, Vault, trigger, cron).
3. Testes de integração 1–4.
4. Listar as séries manuais do SENAC na agenda principal → Bryam confirma → encerrar as ocorrências futuras.
5. Atualizar `CLAUDE.md` (status, segredos, operação).
