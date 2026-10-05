# COUPLE admin deployment

This is a separate Next.js app and must be deployed as a **separate Vercel project** from `apps/web`. Set its Root Directory to `fe/apps/admin` and connect `manage.coupleletters.app` to Production. No second domain purchase is needed: `manage` is a subdomain of the existing `coupleletters.app`.

Set these variables only on the admin project, for Production:

- `ADMIN_HOST=manage.coupleletters.app`
- `SUPABASE_URL`: the existing Supabase project URL
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`: the existing dedicated admin credentials
- `ADMIN_BACKEND_SERVICE_ROLE_KEY`: the existing Supabase service-role key (server-side secret)

In **admin project → Settings → Security → Deployment Protection**, turn on **Vercel Authentication for All Deployments**. Do not create shareable bypass links or deployment protection exceptions. Make sure the Vercel team has only the intended admin account before attaching the hostname. This is an outer access gate; the app's own admin login and server-side session checks remain required. The hostname alone is not a secret.

The updated public `apps/web` project no longer contains admin routes. Verify that `/admin` and `/admin/api/list` on `www.coupleletters.app` return 404. Once the production admin login and archive views have been verified, remove `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_BACKEND_SERVICE_ROLE_KEY` from the **public** Vercel project. Keep them in the admin project only. Avoid configuring `auth.coupleletters.app` here; that subdomain is used for email DNS records.

Locally, start with `npm run dev:admin` from the repository root (port 3002). The local app uses the same server-only variables and never needs the service-role key in a `NEXT_PUBLIC_` variable.
