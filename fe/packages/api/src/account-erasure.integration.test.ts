import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  eraseAccount,
  type ErasurePort,
} from "../../../../be/supabase/functions/delete-account/erasure";

const url = process.env.ERASURE_TEST_URL;
const secret = process.env.ERASURE_TEST_SERVICE_KEY;
const anon = process.env.ERASURE_TEST_ANON_KEY;
const enabled = !!(url && secret && anon);
const options = { auth: { persistSession: false, autoRefreshToken: false } };

function fixtureCount(
  table: "memories" | "draws" | "wishes",
  field: "draw_id" | "id" | "author_id",
  id: unknown,
) {
  const uuid = z.uuid().parse(id);
  // Read only counts for known fake IDs from the isolated container. The app
  // service role intentionally lacks direct SELECT grants on business tables.
  return Number(
    execFileSync(
      "docker",
      [
        "exec",
        "supabase_db_couple-erasure-check",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-At",
        "-c",
        `select count(*) from public.${table} where ${field}='${uuid}';`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim(),
  );
}

async function prepareWhileHoldingProfiles(a: string, b: string) {
  z.uuid().parse(a);
  z.uuid().parse(b);
  const sql = `begin; set local request.jwt.claim.role='service_role';
    set local idle_in_transaction_session_timeout='8s';
    select 1 from public.profiles where id in ('${a}','${b}') order by id for no key update;
    select 'profiles-locked'; select pg_sleep(1);
    select api.prepare_account_erasure('${a}'); commit;`;
  let readyResolve!: () => void;
  let readyReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  let sawReady = false;
  const child = spawn(
    "docker",
    [
      "exec",
      "-t",
      "supabase_db_couple-erasure-check",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-P",
      "pager=off",
      "-v",
      "ON_ERROR_STOP=1",
      ...sql
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean)
        .flatMap((statement) => ["-c", statement]),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let diagnostic = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    diagnostic += chunk;
  });
  const completed = new Promise<void>((resolve, reject) => {
    child.once("error", (error) => {
      readyReject(error);
      reject(error);
    });
    child.once("close", (code) => {
      if (code === 0) {
        if (!sawReady)
          readyReject(
            new Error("Concurrent test never signaled profile locks"),
          );
        resolve();
      } else {
        const error = new Error(
          `Isolated concurrent prepare failed: ${diagnostic.slice(0, 600)}`,
        );
        readyReject(error);
        reject(error);
      }
    });
  });
  // Observe setup failure even if it occurs before the caller awaits completed.
  void completed.catch(() => {});
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output += chunk;
    if (output.includes("profiles-locked")) {
      sawReady = true;
      readyResolve();
    }
  });
  await ready;
  return { completed };
}

describe.skipIf(!enabled)("isolated Supabase erasure integration", () => {
  it("removes real Storage bytes and shared B content, preserves B account/wish, then deletes B", async () => {
    // Refuse to run against any hosted project or the developer's existing DB.
    if (url !== "http://127.0.0.1:55321")
      throw new Error("Only isolated local test project is allowed");
    const admin = createClient(url, secret!, options);
    const users: string[] = [];
    async function raw(
      client: SupabaseClient,
      name: string,
      args: Record<string, unknown> = {},
    ) {
      const result = await client.schema("api").rpc(name, args);
      if (result.error) throw new Error(`RPC ${name}: ${result.error.code}`);
      return result.data;
    }
    async function app(
      client: SupabaseClient,
      name: string,
      args: Record<string, unknown> = {},
    ) {
      return z
        .object({
          ok: z.literal(true),
          data: z.record(z.string(), z.unknown()),
        })
        .parse(await raw(client, name, args)).data;
    }
    const port: ErasurePort = {
      prepare: (userId) =>
        raw(admin, "prepare_account_erasure", { p_user_id: userId }),
      removeFiles: async (bucket, names) => {
        const result = await admin.storage.from(bucket).remove(names);
        if (result.error) throw new Error("Storage deletion failed");
      },
      markFilesRemoved: async (id) => {
        await raw(admin, "mark_account_files_removed", { p_job_id: id });
      },
      deleteUser: async (id) => {
        const result = await admin.auth.admin.deleteUser(id);
        if (result.error) throw new Error("Auth deletion failed");
      },
      userIsMissing: async (id) => {
        const result = await admin.auth.admin.getUserById(id);
        return !result.data.user && result.error?.status === 404;
      },
      recordFailure: async (id, stage) => {
        await raw(admin, "account_erasure_failed", {
          p_job_id: id,
          p_stage: stage,
        });
      },
    };
    async function createUser() {
      const email = `erasure-${randomUUID()}@example.test`;
      const password = `Fixture-${randomUUID()}!`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error || !created.data.user)
        throw new Error("Fixture user creation failed");
      const id = created.data.user.id;
      users.push(id);
      const client = createClient(url!, anon!, options);
      const signed = await client.auth.signInWithPassword({ email, password });
      if (signed.error) throw new Error("Fixture login failed");
      await app(client, "update_my_profile", {
        p_display_name: "Erasure fixture",
        p_timezone: "Asia/Ho_Chi_Minh",
      });
      return { client, id };
    }
    try {
      const a = await createUser();
      const b = await createUser();
      const invite = await app(a.client, "create_invite", {
        p_request_id: randomUUID(),
      });
      const request = await app(b.client, "request_connection", {
        p_code: invite.code,
        p_request_id: randomUUID(),
      });
      const pair = await app(a.client, "respond_connection", {
        p_connection_request_id: request.connectionRequestId,
        p_response: "accept",
      });
      const wishArgs = {
        p_description: "Fixture",
        p_category: "care",
        p_budget_vnd: null,
        p_available_from: null,
        p_expires_at: null,
      };
      await app(a.client, "create_wish", {
        ...wishArgs,
        p_title: "A private wish",
        p_request_id: randomUUID(),
      });
      await app(b.client, "create_wish", {
        ...wishArgs,
        p_title: "B own wish",
        p_request_id: randomUUID(),
      });
      const draw = await app(b.client, "draw_wish", {
        p_request_id: randomUUID(),
        p_category: null,
        p_max_budget_vnd: null,
      });
      await app(b.client, "respond_draw", {
        p_draw_id: draw.id,
        p_response: "accepted",
        p_message: null,
        p_deferred_until: null,
      });
      await app(b.client, "complete_draw", { p_draw_id: draw.id });
      const path = `${pair.coupleId}/${draw.id}/${b.id}/${randomUUID()}.png`;
      const uploaded = await b.client.storage
        .from("couple-memories")
        .upload(path, new Uint8Array([137, 80, 78, 71]), {
          contentType: "image/png",
        });
      expect(uploaded.error).toBeNull();
      await app(b.client, "save_memory", {
        p_draw_id: draw.id,
        p_message: "B shared fixture memory",
        p_photo_storage_key: path,
      });
      expect(
        (await admin.storage.from("couple-memories").download(path)).error,
      ).toBeNull();

      // B starts another upload while erasure owns both profile locks. Its
      // earlier RLS snapshot must not let it create a post-manifest orphan.
      const concurrent = await prepareWhileHoldingProfiles(a.id, b.id);
      const latePath = `${pair.coupleId}/${draw.id}/${b.id}/${randomUUID()}.png`;
      const lateUpload = b.client.storage
        .from("couple-memories")
        .upload(latePath, new Uint8Array([137, 80, 78, 71]), {
          contentType: "image/png",
        });
      await concurrent.completed;
      expect((await lateUpload).error).not.toBeNull();

      expect(await eraseAccount(port, a.id)).toBe(true);
      expect(
        (await admin.storage.from("couple-memories").download(path)).error,
      ).not.toBeNull();
      expect(
        (await admin.storage.from("couple-memories").download(latePath)).error,
      ).not.toBeNull();
      expect(fixtureCount("memories", "draw_id", draw.id)).toBe(0);
      expect(fixtureCount("draws", "id", draw.id)).toBe(0);
      expect(fixtureCount("wishes", "author_id", a.id)).toBe(0);
      expect(fixtureCount("wishes", "author_id", b.id)).toBe(1);
      expect((await admin.auth.admin.getUserById(b.id)).data.user?.id).toBe(
        b.id,
      );
      expect(await port.userIsMissing(a.id)).toBe(true);
      expect((await raw(a.client, "get_my_context")).error.code).toBe(
        "UNAUTHENTICATED",
      );
      const operations = await app(admin, "admin_operations");
      expect(operations.legacyObjects).toBe(0);
      expect(operations.legacyRequests).toBe(0);
      expect(await eraseAccount(port, b.id)).toBe(true);
      expect(await port.userIsMissing(b.id)).toBe(true);
    } finally {
      // Only fake IDs created above, on the isolated localhost project.
      for (const id of users)
        if (!(await port.userIsMissing(id))) await eraseAccount(port, id);
    }
  }, 60_000);
});
