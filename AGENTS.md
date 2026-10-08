# Couple repository guide

## Structure

- `fe/apps/web`: the user-facing Next.js application.
- `fe/apps/admin`: the separate Next.js administration application.
- `fe/apps/landing`: the public, search-indexable COUPLE landing page.
- `fe/packages/api`: shared Supabase API client helpers.
- `fe/packages/domain`: shared schemas, types, labels, and domain errors.
- `fe/packages/theme`: shared product naming and theme constants.
- `fe/tests`: Playwright end-to-end tests for the web and admin applications.
- `be/supabase/migrations`: ordered Supabase SQL migrations.
- `be/supabase/tests`: pgTAP database tests.
- `be/supabase/functions/delete-account`: the account-deletion Edge Function.

## Verified commands

Run these from the repository root:

- `npm run dev:web`: start the web app on its configured development port.
- `npm run dev:admin`: start the admin app on its configured development port.
- `npm run dev:landing`: start the landing page on port 3002.
- `npm run typecheck`: typecheck the web app.
- `npm run lint`: lint the web app.
- `npm run test`: run the frontend Vitest suite.
- `npm run test:e2e`: run the Playwright suite. Prepare the local environment with `fe/scripts/prepare-e2e.ps1` and a running local Supabase instance first.
- `npm run build:web`: build the web app.
- `npm run build:admin`: build the admin app.
- `npm run build:landing`: build the landing page.
- `npm run test:db`: run the Supabase pgTAP tests.

Admin-specific checks are available from `fe/` as `corepack pnpm typecheck:admin` and `corepack pnpm lint:admin`.

## Change rules

- Keep web, admin, shared packages, migrations, and database tests in sync when a feature crosses those boundaries.
- Add database changes as a new ordered file in `be/supabase/migrations`; do not rewrite an applied migration.
- Add authorization and data-visibility coverage in `be/supabase/tests` for new RPCs or tables.
- Keep secrets out of tracked files. Environment examples live in each app's `.env.example` files.
- Do not run a reset command against the linked production Supabase project. Use the local Supabase instance for destructive verification.
