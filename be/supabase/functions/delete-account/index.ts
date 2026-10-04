import { createClient } from "npm:@supabase/supabase-js@2.117.2";

// Gateway JWT validation stays enabled. Auth also verifies the live user here.
const allowedOrigins = new Set([
  "http://127.0.0.1:3001",
  "http://localhost:3001",
  "http://127.0.0.1:3100",
  ...(Deno.env.get("COUPLE_WEB_ORIGINS") ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean),
]);
type ArchiveFile = { bucket: string; name: string; archiveKey: string };
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
  try {
    const { data: archive, error } = await admin
      .schema("api")
      .rpc("prepare_account_deletion", { p_user_id: user.id });
    if (error || !archive?.id) throw new Error("prepare");
    // Resumable: never remove an original before its archive copy exists.
    for (const file of archive.files as ArchiveFile[]) {
      const destination = admin.storage.from("deleted-data");
      const existing = await destination.download(file.archiveKey);
      if (existing.error) {
        const original = await admin.storage
          .from(file.bucket)
          .download(file.name);
        if (original.error || !original.data) throw new Error("read original");
        const copied = await destination.upload(
          file.archiveKey,
          original.data,
          {
            contentType: original.data.type || "application/octet-stream",
            upsert: false,
          },
        );
        if (copied.error && (await destination.download(file.archiveKey)).error)
          throw new Error("copy");
      }
      const removed = await admin.storage.from(file.bucket).remove([file.name]);
      if (removed.error) throw new Error("remove original");
    }
    const ready = await admin
      .schema("api")
      .rpc("mark_deletion_files_ready", { p_archive_id: archive.id });
    if (ready.error) throw new Error("manifest incomplete");
    const deleted = await admin.auth.admin.deleteUser(user.id, false);
    if (deleted.error) {
      const check = await admin.auth.admin.getUserById(user.id);
      if (check.data.user || !check.error || check.error.status !== 404)
        throw new Error("auth deletion");
    }
    return response(200);
  } catch {
    return response(503, "DELETION_RETRY_REQUIRED");
  }
});
