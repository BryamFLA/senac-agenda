# senac-agenda

Agenda do instrutor Bryam (SENAC Francisco Beltrão), editada pelas coordenadoras em
**agenda.bryam.com.br** e usada como fonte única pelas automações (Google Calendar, PTDs, material, rateio).

## Stack
- **Supabase** (`senac-agenda`, sa-east-1): Postgres + Auth. Acesso só para e-mails na tabela `editores` (RLS).
- **Next.js** exportado como site estático (`out/`) → **Firebase Hosting** (site padrão do projeto `senac-gestao`).
- **GitHub Actions**: PR → preview; push na `main` → produção.

## Banco
| Tabela | Para quê |
|---|---|
| `compromissos` | Lista suspensa da tela (nome, 2ª linha, código da turma, tipo, horário padrão) |
| `agenda` | Um registro por data + turno (M/T/N): compromisso, início, fim, observação, `gcal_event_id` |
| `editores` | Quem pode ler/editar |
| `agenda_historico` | Quem alterou o quê (trigger) |

Migrações em `supabase/migrations`. A carga inicial veio da aba 2026 de `Bryam Agenda.xlsx` via `scripts/import_excel.py`.

## Rodar local
```bash
npm install
cp .env.example .env.local
npm run dev
```

## Configuração única (manual)
1. **Firebase**: `firebase login` e `npm run build && firebase deploy --only hosting`
2. **Domínio**: Firebase Console → Hosting → *Add custom domain* → `agenda.bryam.com.br` → criar no DNS os registros que o Firebase mostrar.
3. **GitHub** (Settings → Secrets and variables → Actions):
   - Secret `FIREBASE_SERVICE_ACCOUNT_SENAC_GESTAO` (gerado por `firebase init hosting:github` ou JSON de conta de serviço com papel *Firebase Hosting Admin*)
4. **Supabase Auth**: Site URL = `https://agenda.bryam.com.br`; desligar *Allow new users to sign up*; convidar as coordenadoras em *Users → Invite* e incluir o e-mail delas em `editores`.

## Próximas etapas
- Edge Function `sync-gcal` + Database Webhook (agenda → Google Calendar) e conferência noturna (pg_cron).
