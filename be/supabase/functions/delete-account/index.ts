import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { eraseAccount } from "./erasure.ts";
import { deletionOrigins } from "./origins.ts";

// Gateway JWT validation stays enabled. Auth also verifies the live user here.
const allowedOrigins = deletionOrigins(Deno.env.get("COUPLE_WEB_ORIGINS"));
Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin))
    return new Response(null, { status: 403 });
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  const response = (status: number, code?: string) =>
    Response.json(code ? { ok: false, error: { code } } : { ok: true }, {
      status,
      headers,
    });
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return response(405, "METHOD_NOT_ALLOWED");
  const token = request.headers
    .get("Authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return response(401, "UNAUTHENTICATED");
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(token);
  if (authError || !user?.email || !user.email_confirmed_at)
    return response(401, "UNAUTHENTICATED");
  let body: { confirmation?: string; email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return response(400, "VALIDATION_ERROR");
  }
  if (
    body.confirmation !== "XOÁ TÀI KHOẢN" ||
    typeof body.email !== "string" ||
    body.email.trim().toLowerCase() !== user.email.toLowerCase() ||
    typeof body.password !== "string" ||
    body.password.length < 1 ||
    body.password.length > 1024
  )
    return response(400, "VALIDATION_ERROR");
  const verifier = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verified = await verifier.auth.signInWithPassword({
    email: user.email,
    password: body.password,
  });
  if (verified.error || verified.data.user?.id !== user.id)
    return response(403, "REAUTH_REQUIRED");
  await verifier.auth.signOut({ scope: "local" });
  const rpc = async (name: string, args: Record<string, string>) => {
    const result = await admin.schema("api").rpc(name, args);
    if (result.error) throw new Error("database");
    return result.data;
  };
  const erased = await eraseAccount(
    {
      prepare: (userId) =>
        rpc("prepare_account_erasure", { p_user_id: userId }),
      removeFiles: async (bucket, names) => {
        const result = await admin.storage.from(bucket).remove(names);
        if (result.error) throw new Error("storage");
      },
      markFilesRemoved: async (jobId) => {
        await rpc("mark_account_files_removed", { p_job_id: jobId });
      },
      deleteUser: async (userId) => {
        const result = await admin.auth.admin.deleteUser(userId, false);
        if (result.error) throw new Error("auth");
      },
      userIsMissing: async (userId) => {
        const result = await admin.auth.admin.getUserById(userId);
        return !result.data.user && result.error?.status === 404;
      },
      recordFailure: async (jobId, stage) => {
        await rpc("account_erasure_failed", {
          p_job_id: jobId,
          p_stage: stage,
        });
      },
    },
    user.id,
  );
  return erased ? response(200) : response(503, "DELETION_RETRY_REQUIRED");
});
