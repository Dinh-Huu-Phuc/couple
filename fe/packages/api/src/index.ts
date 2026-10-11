import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  AppError,
  contextSchema,
  chatMessageSchema,
  letterActivitySchema,
  drawSchema,
  feedbackSchema,
  inviteSchema,
  memorySchema,
  previewSchema,
  requestSchema,
  wishSchema,
  type WishInput,
  type FeedbackInput,
} from "@couple/domain";

const envelope = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      retryAfterSeconds: z.number().optional(),
    }),
  }),
]);
export async function rpc<T>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await client.schema("api").rpc(name, args);
  if (error)
    throw new AppError(
      error.code === "PGRST301" ? "UNAUTHENTICATED" : "NETWORK_ERROR",
    );
  const result = envelope.safeParse(data);
  if (!result.success) throw new AppError("INVALID_RESPONSE");
  if (!result.data.ok)
    throw new AppError(
      result.data.error.code,
      result.data.error.retryAfterSeconds,
    );
  const parsed = schema.safeParse(result.data.data);
  if (!parsed.success) throw new AppError("INVALID_RESPONSE");
  return parsed.data;
}
export const queryKeys = {
  context: (user: string) => [user, "context"] as const,
  pendingPartnerWishes: (user: string, couple: string | null) =>
    [user, couple, "pending-partner-wishes"] as const,
  requests: (user: string) => [user, "requests"] as const,
  wishes: (user: string, couple: string | null, status: string) =>
    [user, couple, "wishes", status] as const,
  draws: (user: string, couple: string) => [user, couple, "draws"] as const,
  memories: (user: string, couple: string) =>
    [user, couple, "memories"] as const,
  chat: (user: string, couple: string) => [user, couple, "chat"] as const,
  feedback: (user: string) => [user, "feedback"] as const,
};
const ok = z.unknown();
const wishArgs = (p: WishInput) => ({
  p_title: p.title,
  p_description: p.description,
  p_category: p.category,
  p_budget_vnd: p.budgetVnd,
  p_available_from: p.availableFrom,
  p_expires_at: p.expiresAt,
  p_greeting: p.greeting,
  p_closing: p.closing,
  p_signature: p.signature,
  p_template_id: p.templateId,
  p_photo_storage_key: p.photoStorageKey,
});
export function coupleApi(client: SupabaseClient) {
  return {
    context: () => rpc(client, "get_my_context", {}, contextSchema),
    pendingPartnerWishes: () =>
      rpc(
        client,
        "pending_partner_wish_count",
        {},
        z.number().int().nonnegative(),
      ),
    profile: (name: string, timezone: string) =>
      rpc(
        client,
        "update_my_profile",
        { p_display_name: name, p_timezone: timezone },
        ok,
      ),
    invite: (key: string) =>
      rpc(client, "create_invite", { p_request_id: key }, inviteSchema),
    revoke: (id: string) =>
      rpc(client, "revoke_invite", { p_invite_id: id }, ok),
    preview: (code: string) =>
      rpc(client, "preview_invite", { p_code: code }, previewSchema),
    connect: (code: string, key: string) =>
      rpc(
        client,
        "request_connection",
        { p_code: code, p_request_id: key },
        ok,
      ),
    requests: (before?: string) =>
      rpc(
        client,
        "list_connection_requests",
        { p_limit: 20, p_before: before ?? null },
        z.object({
          incoming: z.array(requestSchema),
          outgoing: z.array(requestSchema),
        }),
      ),
    respondConnection: (id: string, response: "accept" | "reject") =>
      rpc(
        client,
        "respond_connection",
        { p_connection_request_id: id, p_response: response },
        ok,
      ),
    cancelConnection: (id: string) =>
      rpc(
        client,
        "cancel_connection_request",
        { p_connection_request_id: id },
        ok,
      ),
    deleteConnectionHistory: (id: string) =>
      rpc(client, "delete_connection_history", { p_history_id: id }, ok),
    createWish: (p: WishInput, key: string) =>
      rpc(
        client,
        "create_wish",
        { ...wishArgs(p), p_request_id: key },
        wishSchema,
      ),
    updateWish: (id: string, version: number, p: WishInput) =>
      rpc(
        client,
        "update_wish",
        { ...wishArgs(p), p_wish_id: id, p_expected_version: version },
        wishSchema,
      ),
    statusWish: (id: string, version: number, status: string) =>
      rpc(
        client,
        "set_wish_status",
        { p_wish_id: id, p_expected_version: version, p_status: status },
        wishSchema,
      ),
    withdrawWish: (id: string, version: number) =>
      rpc(
        client,
        "withdraw_wish",
        { p_wish_id: id, p_expected_version: version },
        wishSchema,
      ),
    draw: (key: string, category: string | null, budget: number | null) =>
      rpc(
        client,
        "draw_wish",
        { p_request_id: key, p_category: category, p_max_budget_vnd: budget },
        drawSchema,
      ),
    respondDraw: (
      id: string,
      response: "accepted" | "discuss" | "deferred",
      details?: { message?: string; deferredUntil?: string },
    ) =>
      rpc(
        client,
        "respond_draw",
        {
          p_draw_id: id,
          p_response: response,
          p_message: details?.message ?? null,
          p_deferred_until: details?.deferredUntil ?? null,
        },
        drawSchema,
      ),
    complete: (id: string) =>
      rpc(client, "complete_draw", { p_draw_id: id }, drawSchema),
    memory: (drawId: string, message: string, key: string | null) =>
      rpc(
        client,
        "save_memory",
        { p_draw_id: drawId, p_message: message, p_photo_storage_key: key },
        memorySchema,
      ),
    sendChatMessage: (
      body: string,
      requestId: string,
      photoKey: string | null,
      coupleId: string,
    ) =>
      rpc(
        client,
        "send_chat_message_to_couple",
        {
          p_body: body,
          p_couple_id: coupleId,
          p_request_id: requestId,
          p_photo_storage_key: photoKey,
        },
        chatMessageSchema,
      ),
    letterActivity: () =>
      rpc(client, "list_letter_activity", {}, z.array(letterActivitySchema)),
    ackChatMessages: (ids: string[], read = false) =>
      rpc(
        client,
        "ack_chat_messages",
        { p_ids: ids, p_read: read },
        z.boolean(),
      ),
    seeLetterActivity: (drawId: string, version: number) =>
      rpc(
        client,
        "see_letter_activity",
        { p_draw_id: drawId, p_version: version },
        z.boolean(),
      ),
    saveLetterDraft: (slot: string, payload: Record<string, unknown>) =>
      rpc(
        client,
        "save_letter_draft",
        { p_slot: slot, p_payload: payload },
        z.boolean(),
      ),
    deleteLetterDraft: (slot: string) =>
      rpc(client, "delete_letter_draft", { p_slot: slot }, z.boolean()),
    end: (coupleId: string, key: string) =>
      rpc(
        client,
        "end_couple",
        { p_couple_id: coupleId, p_request_id: key },
        ok,
      ),
    createFeedback: (input: FeedbackInput, key: string) =>
      rpc(
        client,
        "create_feedback",
        {
          p_request_id: key,
          p_type: input.type,
          p_title: input.title,
          p_body: input.body,
          p_reply_email: input.replyEmail,
        },
        feedbackSchema,
      ),
    feedback: () =>
      rpc(client, "list_my_feedback", { p_limit: 20 }, z.array(feedbackSchema)),
  };
}
export type Cursor = { at: string; id: string } | undefined;
export async function listRows(
  client: SupabaseClient,
  table: "wishes" | "draws" | "memories",
  user: string,
  couple: string | null,
  cursor?: Cursor,
  status = "all",
) {
  const order = table === "draws" ? "drawn_at" : "created_at";
  const columns: string =
    table === "wishes"
      ? "id,couple_id,author_id,title,description,category,budget_vnd,status,available_from,expires_at,eligible_after,greeting,closing,signature,template_id,photo_storage_key,version,created_at,updated_at"
      : table === "draws"
        ? "id,couple_id,wish_id,drawn_by,status,snapshot,drawn_at,completed_at,discussion_message,discussion_at,deferred_until"
        : "id,draw_id,created_by,message,photo_storage_key,created_at,updated_at,draws!inner(snapshot,couple_id)";
  let query = client
    .from(table)
    .select(columns)
    .order(order, { ascending: false })
    .order("id", { ascending: false })
    .limit(20);
  if (table === "wishes") {
    query = query.eq("author_id", user);
    if (status !== "all") query = query.eq("status", status);
    if (couple) query = query.eq("couple_id", couple);
  } else
    query = query.eq(
      table === "memories" ? "draws.couple_id" : "couple_id",
      couple!,
    );
  if (cursor) {
    z.iso.datetime({ offset: true }).parse(cursor.at);
    z.uuid().parse(cursor.id);
    query = query.or(
      `${order}.lt.${cursor.at},and(${order}.eq.${cursor.at},id.lt.${cursor.id})`,
    );
  }
  const { data, error } = await query;
  if (error) throw new AppError("NETWORK_ERROR");
  return data ?? [];
}
