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

The current deletion lifecycle and rollout are documented in
[erasure-operations.md](md/erasure-operations.md). New account deletions remove live
content and photos without creating archive copies. The private admin app exposes
only aggregate operations counts and deletion request metadata. Existing archives
are blocked from admin access and preserved pending a separate cleanup decision.

For Vercel, use `fe/apps/web` as the Root Directory and enable **Include source
files outside of the Root Directory in the Build Step** for the shared packages
and shared backend modules. Configure the public Supabase variables from the web's
`.env.example`. Deploy admin as a separate Vercel project rooted at `fe/apps/admin`,
using the server-only variables `ADMIN_HOST`, `SUPABASE_URL`, `ADMIN_USERNAME`,
`ADMIN_PASSWORD`, and `ADMIN_BACKEND_SERVICE_ROLE_KEY`. Admin credentials do not
belong in the public web project or any `NEXT_PUBLIC_` variable.

The hosted `delete-account` Edge Function allows only named web origins. After
deploying the web to a new domain, set `COUPLE_WEB_ORIGINS` on the **Supabase**
project to the exact HTTPS origin (no path or trailing slash). The production
origins are `https://www.coupleletters.app` and `https://couple-three-pi.vercel.app`.
From `be/`:

```powershell
corepack pnpm exec supabase secrets set COUPLE_WEB_ORIGINS=https://www.coupleletters.app,https://couple-three-pi.vercel.app --project-ref ldxekwjpzxsnhhcvvlfi
```

This setting controls browser CORS for account deletion. The function separately
requires a valid user JWT, current password, and confirmation phrase; the CORS
setting does not grant account-deletion permission.
# Tài khoản không hoạt động

Mặc định 45 ngày; admin chỉnh tại giao diện quản trị. Worker kiểm tra mỗi giờ, chỉ xoá tài khoản đã chấp nhận phiên bản đang áp dụng. Cần migration `20261005000400_inactive_accounts.sql`, các migration account erasure trước đó, web/admin mới và `CRON_SECRET` riêng cho Production của `couple-admin` (ít nhất 32 ký tự ngẫu nhiên). Đặc tả, bản nháp điều khoản và thứ tự rollout nằm tại `md/inactive-account-policy.md` trong workspace; thư mục md không được commit theo cấu hình repo.

Moderation của admin dùng migration `20261006000100_account_moderation.sql`: ban/bỏ ban qua Supabase Auth và cổng dữ liệu ứng dụng, hoặc xoá tài khoản vi phạm bằng cùng quy trình erasure. Admin phải chọn nhóm vi phạm và nhập lý do cụ thể. Bản nháp chính sách trong `md/inactive-account-policy.md` có thêm điều khoản xử lý vi phạm; cần rà soát trước khi công bố.
