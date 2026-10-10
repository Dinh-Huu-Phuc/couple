# Letters, private photos and paired chat

The new editor writes plain text (title, greeting, body, closing, signature), a paper template and an optional private photo key. Existing version 1 draw snapshots remain readable; new draws capture immutable version 2 snapshots. A recipient cannot read the author's wishes, drafts or letter photos before drawing a wish.

Drafts are stored in `public.letter_drafts`, scoped to author and current couple. Sending a letter removes its draft in the same transaction. Drafts are erased when that connection ends.

`public.chat_messages` is readable only by current members of an active couple. Sends go through the guarded `api.send_chat_message` RPC with request IDs for safe retries. There is no total message limit. Each message allows 2,000 text characters and one optional photo; the RPC limits sends to 120 per minute. History loads 50 messages at a time, with Realtime updates and polling fallback.

Photo bytes use the private `couple-letter-attachments` and `couple-chat-attachments` Storage buckets, not database columns. The client accepts JPEG/PNG/WebP up to 5 MiB, redraws images as WebP without original metadata and scales the longest side to at most 2,048 pixels. Uploaded photos remain sensitive user data; this is not end-to-end encryption.

Ending a couple erases its chat rows transactionally and immediately revokes chat-photo access. The admin's existing daily `/api/inactivity-cleanup` cron also physically removes orphaned attachments via Storage API, up to 100 files per run. Referenced letter snapshots and authored wishes retain their photos. Abandoned uploads become eligible after one hour. Cleanup claims files under the couple lock; sends and draft saves reject claimed files. Failed removals and remaining batches wait for a later run.

Account erasure now includes all three private photo buckets. Storage bytes must be removed and verified before Auth deletion completes. The old admin archive stays inaccessible.

## Validation and production rollout

Local validation from the repository root: `npm run test:db`, `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build:web`, `npm run build:admin`. The browser test is `fe/tests/letters-chat.spec.ts`; it uses the existing local-only Playwright configuration and ignored `fe/.env.e2e`.

The browser suite also exercises self-deletion with wrong/correct passwords. Run the local Edge Function in a separate terminal first: `corepack pnpm --dir be exec supabase functions serve delete-account`. Then run `corepack pnpm --dir fe exec playwright test tests/letters-chat.spec.ts`. All accounts created by this test are local fixtures.

Before deploying the frontend, apply both ordered migrations:

- `be/supabase/migrations/20261010000100_letter_editor_chat.sql`
- `be/supabase/migrations/20261010000200_chat_photos_cleanup.sql`

Then deploy the updated `be/supabase/functions/delete-account` Edge Function and both web/admin applications. Verify the admin Production `CRON_SECRET` matches the scheduled request authentication and that the existing cron runs successfully. Without that cron, chat rows/access are still removed, but orphaned photo bytes will not be physically collected. Never reset the linked production database.

For a rollout smoke test, use two test accounts: save/reopen a private draft with a photo, send and draw it, send chat text/photos in both directions, retry a send, then end the pairing and verify chat/photo access disappears. Check cleanup separately before relying on physical deletion.
