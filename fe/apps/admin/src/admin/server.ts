import "server-only";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  adminConfig,
  hashToken,
  matchCredentials,
  newToken,
  SESSION_SECONDS,
} from "../../../../../be/admin/auth.mjs";
import { readBoundedJson } from "../../../../../be/admin/read-json.mjs";

import {
  deletionRowSchema,
  operationsSchema,
  policySchema,
  activityRowSchema,
  adminFeedbackSchema,
} from "./operations-data";
import { eraseAccount, inactivityErasurePort } from "./inactivity-erasure";

const COOKIE = "couple-admin-session";
function requestOrigin(request: NextRequest) {
  const host = process.env.ADMIN_HOST;
  if (process.env.NODE_ENV === "production") {
    if (!host) throw new Error("Missing admin host.");
    return `https://${host}`;
  }
  return request.nextUrl.origin;
}
export function backend() {
  const config = adminConfig();
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("Missing server-side Supabase URL.");
  const client = createClient(url, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { config, client };
}
export async function adminSessionValid() {
  try {
    const token = (await cookies()).get(COOKIE)?.value;
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
    const { config, client } = backend();
    const result = await client.schema("api").rpc("admin_session_valid", {
      p_token_hash: hashToken(token),
      p_credential_version: config.version,
    });
    return !result.error && result.data === true;
  } catch {
    return false;
  }
}
const reply = (status: number, code?: string, data?: unknown) =>
  NextResponse.json(
    code ? { ok: false, error: { code } } : { ok: true, data },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
export async function adminHandler(request: NextRequest, action: string) {
  if (
    request.method === "POST" &&
    request.headers.get("origin") !== requestOrigin(request)
  )
    return reply(403, "NOT_ALLOWED");
  try {
    if (request.method === "POST" && action === "login") {
      if (Number(request.headers.get("content-length") ?? 0) > 8192)
        return reply(400, "VALIDATION_ERROR");
      const body = z
        .object({
          username: z.string().min(1).max(100),
          password: z.string().min(1).max(1024),
        })
        .safeParse(await readBoundedJson(request));
      if (!body.success) return reply(400, "VALIDATION_ERROR");
      const { config, client } = backend();
      const matched = matchCredentials(
        config,
        body.data.username,
        body.data.password,
      );
      const attempts = await client
        .schema("api")
        .rpc("admin_login_attempt", { p_success: matched });
      if (attempts.error) return reply(503, "ADMIN_UNAVAILABLE");
      if (attempts.data !== true) return reply(429, "ADMIN_RATE_LIMITED");
      if (!matched) return reply(401, "ADMIN_INVALID_CREDENTIALS");
      const token = newToken();
      const created = await client.schema("api").rpc("admin_session_create", {
        p_token_hash: hashToken(token),
        p_credential_version: config.version,
      });
      if (created.error) return reply(503, "ADMIN_UNAVAILABLE");
      const response = reply(200, undefined, {});
      response.cookies.set(COOKIE, token, {
        httpOnly: true,
        sameSite: "strict",
        secure: requestOrigin(request).startsWith("https://"),
        path: "/",
        maxAge: SESSION_SECONDS,
      });
      return response;
    }
    if (request.method === "POST" && action === "logout") {
      const token = (await cookies()).get(COOKIE)?.value;
      if (token && /^[a-f0-9]{64}$/.test(token)) {
        const revoked = await backend()
          .client.schema("api")
          .rpc("admin_session_revoke", { p_token_hash: hashToken(token) });
        if (revoked.error) return reply(503, "ADMIN_UNAVAILABLE");
      }
      const response = reply(200, undefined, {});
      response.cookies.set(COOKIE, "", {
        httpOnly: true,
        sameSite: "strict",
        secure: requestOrigin(request).startsWith("https://"),
        path: "/",
        maxAge: 0,
      });
      return response;
    }
    if (
      request.method !== "GET" &&
      !(
        request.method === "POST" &&
        ["inactivity-policy", "delete-inactive", "moderation", "feedback"].includes(action)
      )
    )
      return reply(405, "METHOD_NOT_ALLOWED");
    if (!(await adminSessionValid()))
      return reply(401, "ADMIN_SESSION_EXPIRED");
    const { client } = backend();
    if (action === "feedback") {
      if (request.method === "POST") {
        const body = z.object({
          id: z.uuid(),
          status: z.enum(["new", "reviewing", "resolved"]),
          reply: z.string().trim().max(4000),
        }).safeParse(await readBoundedJson(request));
        if (!body.success) return reply(400, "VALIDATION_ERROR");
        const result = await client.schema("api").rpc("admin_update_feedback", {
          p_id: body.data.id,
          p_status: body.data.status,
          p_admin_reply: body.data.reply || null,
        });
        const parsed = adminFeedbackSchema.safeParse(result.data);
        if (result.error || !parsed.success) return reply(503, "ADMIN_UNAVAILABLE");
        return reply(200, undefined, parsed.data);
      }
      const status = z.enum(["new", "reviewing", "resolved"]).nullable().safeParse(
        request.nextUrl.searchParams.get("status"),
      );
      if (!status.success) return reply(400, "VALIDATION_ERROR");
      const result = await client.schema("api").rpc("admin_feedback", { p_status: status.data });
      const parsed = z.array(adminFeedbackSchema).safeParse(result.data);
      if (result.error || !parsed.success) return reply(503, "ADMIN_UNAVAILABLE");
      return reply(200, undefined, parsed.data);
    }
    if (action === "inactivity-policy") {
      if (request.method === "POST") {
        const body = policySchema.safeParse(await readBoundedJson(request));
        if (!body.success) return reply(400, "VALIDATION_ERROR");
        const result = await client
          .schema("api")
          .rpc("admin_update_inactivity_policy", {
            p_days: body.data.days,
            p_version: body.data.version,
          });
        if (result.error) return reply(409, "INACTIVITY_POLICY_CHANGED");
        return reply(200, undefined, policySchema.parse(result.data));
      }
      const result = await client.schema("api").rpc("inactivity_policy");
      if (result.error) return reply(503, "ADMIN_UNAVAILABLE");
      return reply(200, undefined, policySchema.parse(result.data));
    }
    if (action === "accounts") {
      const after = z
        .uuid()
        .nullable()
        .safeParse(request.nextUrl.searchParams.get("after"));
      if (!after.success) return reply(400, "VALIDATION_ERROR");
      const result = await client
        .schema("api")
        .rpc("admin_activity_accounts", { p_after: after.data });
      if (result.error) return reply(503, "ADMIN_UNAVAILABLE");
      const rows = z.array(activityRowSchema.omit({ banned: true, ban_reason: true, banned_at: true })).parse(result.data);
      const bans = await client.schema("api").rpc("admin_ban_statuses", { p_user_ids: rows.map((row) => row.id) });
      if (bans.error) return reply(503, "ADMIN_UNAVAILABLE");
      const banRows = z.array(z.object({ id: z.uuid(), reason: z.enum(["spam", "harassment", "abuse", "other"]), banned_at: z.string() })).parse(bans.data);
      const byId = new Map(banRows.map((ban) => [ban.id, ban]));
      return reply(
        200,
        undefined,
        rows.map((row) => ({ ...row, banned: byId.has(row.id), ban_reason: byId.get(row.id)?.reason ?? null, banned_at: byId.get(row.id)?.banned_at ?? null })),
      );
    }
    if (action === "moderation" && request.method === "POST") {
      const body = z.object({
        id: z.uuid(),
        operation: z.enum(["ban", "unban", "delete"]),
        reason: z.enum(["spam", "harassment", "abuse", "other"]).optional(),
        note: z.string().trim().min(10).max(500).optional(),
        confirmation: z.literal("XOÁ TÀI KHOẢN").optional(),
      }).safeParse(await readBoundedJson(request));
      if (!body.success) return reply(400, "VALIDATION_ERROR");
      const { id, operation, reason, note, confirmation } = body.data;
      if (operation !== "unban" && (!reason || !note)) return reply(400, "VALIDATION_ERROR");
      if (operation === "delete" && confirmation !== "XOÁ TÀI KHOẢN") return reply(400, "VALIDATION_ERROR");
      if (operation === "delete") {
        const port = inactivityErasurePort(client);
        const erased = await eraseAccount({ ...port, prepare: async (userId) => {
          const prepared = await client.schema("api").rpc("prepare_moderated_account_erasure", {
            p_user_id: userId, p_reason: reason!, p_note: note!,
          });
          if (prepared.error) throw new Error("database");
          return prepared.data;
        } }, id);
        return erased ? reply(200, undefined, {}) : reply(409, "MODERATION_ERASURE_PENDING");
      }
      if (operation === "ban") {
        const saved = await client.schema("api").rpc("admin_set_account_ban", {
          p_user_id: id, p_reason: reason!, p_note: note!, p_banned: true,
        });
        if (saved.error) return reply(409, "ADMIN_UNAVAILABLE");
        const authBan = await client.auth.admin.updateUserById(id, { ban_duration: "876000h" });
        return authBan.error ? reply(503, "ADMIN_BAN_AUTH_PENDING") : reply(200, undefined, {});
      }
      const authUnban = await client.auth.admin.updateUserById(id, { ban_duration: "none" });
      if (authUnban.error) return reply(503, "ADMIN_UNAVAILABLE");
      const lifted = await client.schema("api").rpc("admin_set_account_ban", {
        p_user_id: id, p_reason: "other", p_note: "unban", p_banned: false,
      });
      return lifted.error ? reply(503, "ADMIN_UNAVAILABLE") : reply(200, undefined, {});
    }
    if (action === "delete-inactive" && request.method === "POST") {
      const body = z
        .object({ id: z.uuid(), confirmation: z.literal("XOÁ TÀI KHOẢN") })
        .safeParse(await readBoundedJson(request));
      if (!body.success) return reply(400, "VALIDATION_ERROR");
      const erased = await eraseAccount(
        inactivityErasurePort(client),
        body.data.id,
      );
      return erased
        ? reply(200, undefined, {})
        : reply(409, "INACTIVITY_ERASURE_PENDING");
    }
    if (action === "operations") {
      const result = await client.schema("api").rpc("admin_operations");
      const data = operationsSchema.safeParse(result.data?.data);
      if (result.error || !result.data?.ok || !data.success)
        return reply(503, "ADMIN_UNAVAILABLE");
      return reply(200, undefined, data.data);
    }
    if (action === "list") {
      const input = z
        .object({
          before: z.iso.datetime({ offset: true }).nullable(),
          beforeId: z.uuid().nullable(),
          kind: z.enum(["account", "connection"]).nullable(),
        })
        .safeParse({
          before: request.nextUrl.searchParams.get("before"),
          beforeId: request.nextUrl.searchParams.get("beforeId"),
          kind: request.nextUrl.searchParams.get("kind"),
        });
      if (!input.success) return reply(400, "VALIDATION_ERROR");
      const result = await client.schema("api").rpc("admin_deleted_data", {
        p_before: input.data.before,
        p_before_id: input.data.beforeId,
        p_kind: input.data.kind,
      });
      if (result.error || !result.data?.ok)
        return reply(503, "ADMIN_UNAVAILABLE");
      const data = z.array(deletionRowSchema).safeParse(result.data.data);
      if (!data.success) return reply(503, "ADMIN_UNAVAILABLE");
      return reply(200, undefined, data.data);
    }
    return reply(404, "NOT_ALLOWED");
  } catch {
    return reply(503, "ADMIN_UNAVAILABLE");
  }
}
