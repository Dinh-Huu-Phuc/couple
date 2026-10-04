# COUPLE backend

Supabase backend for COUPLE. The frontend never receives a secret key and never writes business tables directly.

## Requirements

- Node.js 20.12 or newer (admin runtime uses the built-in env parser)
- pnpm 12.8.1 through Corepack
- Docker Desktop
- Supabase CLI 2.119.0, installed as a project dependency

## Local setup

```powershell
corepack pnpm install
corepack pnpm run db:start
corepack pnpm run db:reset
corepack pnpm run test:db
```

Local services:

- API: `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`
- Mailpit: `http://127.0.0.1:54324`

Copy `.env.example` to `.env` and keep the real file untracked. Never put a secret/service-role key in frontend variables or source control.

## Cloud workflow

The linked Supabase project is `couple` (`ldxekwjpzxsnhhcvvlfi`).

```powershell
corepack pnpm run db:link
corepack pnpm exec supabase db push --linked --dry-run
corepack pnpm run db:push
corepack pnpm run db:lint
corepack pnpm run test:db:remote
```

Always run `db:reset` and `test:db` locally before pushing a new migration. Never use `db reset --linked` against this project.

## Layout

- `md/`: product specification and private Markdown documentation
- `md/docs/`: backend architecture, decisions, setup and test reports
- `md/fe/docs/`: frontend architecture, design and test reports
- `admin/`: backend-only admin authentication and runtime-key preparation
- `supabase/migrations/`: versioned database changes
- `supabase/tests/`: pgTAP tests
- `supabase/functions/`: narrow Edge Functions, including the authenticated account-deletion workflow
- `email/`: Vietnamese confirmation/reset templates and custom SMTP setup guide

Account/history deletion and the separate private admin interface are documented in
[deletion-admin.md](md/deletion-admin.md). Admin source is intentionally ignored by Git;
provide `fe/apps/web/src/admin/` separately when building a fresh checkout.
