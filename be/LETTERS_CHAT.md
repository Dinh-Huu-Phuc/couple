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

## Letter activity and chat receipts

Apply `20261010000300_letter_activity_chat_receipts.sql`, `20261010000400_unread_letter_activity.sql`, and `20261010000500_chat_send_pair_guard.sql` before deploying this frontend update. They add recipient-owned unread letter activity, recipient-only chat acknowledgement RPCs, and a guard that prevents queued sends from following a user into another pairing. Old letters do not generate opening notifications on rollout; subsequent new replies do. Seeing version N leaves any later version unread. Unpairing removes activity and chat receipts with the messages.

Sent means the message is committed. Delivered means a signed-in recipient device has fetched the message metadata, including when viewing another app page; it is not an operating-system push receipt. Read means the chat is focused and visible and the message intersects the visible chat area. Both times preserve the first acknowledgement across devices. A photo receipt acknowledges its message, not successful downloading of every image byte.

Chat shows pending sends immediately and uses server request IDs to reconcile optimistic rows, RPC responses and Realtime events. Text sends are queued; photo preparation begins on selection and uploads do not block text sends. Failed sends retain their content for retry while the chat remains mounted. Pending sends are not persisted across closing/reloading the page. Realtime reconnection and periodic fetching recover missed messages; delivery latency still depends on the network.

The browser test additionally holds send requests for 1.5 seconds to verify immediate local display and continued composing, tests delivered-before-read, forces one send failure, and checks retry reconciliation. Database coverage is in `be/supabase/tests/014_letter_activity_receipts.sql`.
