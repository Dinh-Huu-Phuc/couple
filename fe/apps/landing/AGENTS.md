<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## COUPLE landing application

- App Router files live in `src/app`; the landing page is a static public route intended for search indexing.
- Preserve Vietnamese diacritics and the self-hosted Lora and Be Vietnam Pro fonts in `public/fonts`.
- Keep normal text letter spacing and word spacing. Wider tracking is reserved for short uppercase eyebrow labels.
- Primary calls to action link to the user application through `NEXT_PUBLIC_APP_URL`, which defaults to `https://app.coupleletters.app`.
- SEO metadata, `robots.txt`, and `sitemap.xml` are defined through Next.js metadata conventions in `src/app`.

## Verified commands

Run these from `fe/`:

- `corepack pnpm --filter @couple/landing dev`
- `corepack pnpm --filter @couple/landing typecheck`
- `corepack pnpm --filter @couple/landing lint`
- `corepack pnpm --filter @couple/landing build`
