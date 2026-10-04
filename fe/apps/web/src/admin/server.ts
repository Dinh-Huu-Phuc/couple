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
import { supabaseConfig } from "@/lib/supabase/config";
import { requestOrigin } from "@/lib/request-origin";
import { readBoundedJson } from "../../../../../be/admin/read-json.mjs";

const COOKIE = "couple-admin-session";
function backend() {
  const config = adminConfig();
  const client = createClient(supabaseConfig().url, config.serviceKey, {
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
        path: "/admin",
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
        path: "/admin",
        maxAge: 0,
      });
      return response;
    }
    if (request.method !== "GET") return reply(405, "METHOD_NOT_ALLOWED");
    if (!(await adminSessionValid()))
      return reply(401, "ADMIN_SESSION_EXPIRED");
    const { client } = backend();
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
      return reply(200, undefined, result.data.data);
    }
    if (action === "detail" || action === "photo") {
      const id = z.uuid().safeParse(request.nextUrl.searchParams.get("id"));
      if (!id.success) return reply(400, "VALIDATION_ERROR");
      const result = await client
        .schema("api")
        .rpc("admin_deleted_detail", { p_archive_id: id.data });
      if (result.error) return reply(503, "ADMIN_UNAVAILABLE");
      if (!result.data?.ok) return reply(404, "NOT_ALLOWED");
      if (action === "detail") return reply(200, undefined, result.data.data);
      const index = z.coerce
        .number()
        .int()
        .min(0)
        .safeParse(request.nextUrl.searchParams.get("index"));
      if (!index.success || !request.nextUrl.searchParams.has("index"))
        return reply(400, "VALIDATION_ERROR");
      const file = result.data.data.files[index.data];
      if (!file || typeof file.archiveKey !== "string")
        return reply(404, "NOT_ALLOWED");
      const photo = await client.storage
        .from("deleted-data")
        .download(file.archiveKey);
      if (photo.error) return reply(404, "NOT_ALLOWED");
      return new NextResponse(photo.data, {
        headers: {
          "Content-Type": photo.data.type || "application/octet-stream",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "inline",
        },
      });
    }
    return reply(404, "NOT_ALLOWED");
  } catch {
    return reply(503, "ADMIN_UNAVAILABLE");
  }
}
