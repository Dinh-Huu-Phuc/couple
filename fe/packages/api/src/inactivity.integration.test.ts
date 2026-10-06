import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  cleanInactiveAccounts,
  inactivityErasurePort,
  eraseAccount,
} from "../../../apps/admin/src/admin/inactivity-erasure";

const url = process.env.ERASURE_TEST_URL;
const key = process.env.ERASURE_TEST_SERVICE_KEY;
const anon = process.env.ERASURE_TEST_ANON_KEY;
describe.skipIf(!url || !key || !anon)(
  "isolated inactivity worker integration",
  () => {
    it("sweeps only expired consenting accounts through real Auth and excludes a returning user", async () => {
      if (url !== "http://127.0.0.1:55321")
        throw new Error("Only isolated local project allowed");
      const options = {
        auth: { persistSession: false, autoRefreshToken: false },
      };
      const admin = createClient(url, key!, options);
      const visitor = createClient(url, anon!, options);
      const policy = await visitor.schema("api").rpc("inactivity_policy");
      expect(policy.error).toBeNull();
      const ids: string[] = [];
      const port = inactivityErasurePort(admin);
      const selfPort = {
        ...port,
        prepare: async (id: string) => {
          const r = await admin
            .schema("api")
            .rpc("prepare_account_erasure", { p_user_id: id });
          if (r.error) throw new Error("database");
          return r.data;
        },
      };
      async function create(consent: boolean) {
        const email = `inactive-fixture-${randomUUID()}@example.test`;
        const password = `Fixture-${randomUUID()}!`;
        const result = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: consent
            ? {
                inactivity_consent: true,
                inactivity_version: policy.data.version,
                inactivity_days: policy.data.days,
              }
            : {},
        });
        if (result.error || !result.data.user)
          throw new Error("fixture creation");
        const id = z.uuid().parse(result.data.user.id);
        ids.push(id);
        return { id, email, password };
      }
      try {
        const stale = await create(true);
        const returning = await create(true);
        const unaccepted = await create(false);
        // This SQL targets only the UUIDs created in this test, in its named local DB.
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
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            `update private.account_activity set last_seen_at=now()-interval '4000 days' where user_id in (${ids.map((id) => `'${z.uuid().parse(id)}'`).join(",")});`,
          ],
          { stdio: "pipe" },
        );
        const signed = await visitor.auth.signInWithPassword({
          email: returning.email,
          password: returning.password,
        });
        expect(signed.error).toBeNull();
        expect(
          (await visitor.schema("api").rpc("touch_account_activity")).error,
        ).toBeNull();
        expect(
          (await visitor.schema("api").rpc("admin_activity_accounts")).error,
        ).not.toBeNull();
        expect(
          (
            await visitor
              .schema("api")
              .rpc("prepare_inactive_account_erasure", { p_user_id: stale.id })
          ).error,
        ).not.toBeNull();
        expect(await cleanInactiveAccounts(admin)).toEqual({
          checked: 1,
          completed: 1,
          deferred: 0,
        });
        expect(await port.userIsMissing(stale.id)).toBe(true);
        expect(await port.userIsMissing(returning.id)).toBe(false);
        expect(await port.userIsMissing(unaccepted.id)).toBe(false);
        const list = await admin.schema("api").rpc("admin_activity_accounts");
        expect(list.error).toBeNull();
        expect(list.data.some((r: { id: string }) => r.id === stale.id)).toBe(
          false,
        );
      } finally {
        for (const id of ids)
          if (!(await port.userIsMissing(id))) await eraseAccount(selfPort, id);
      }
    }, 60_000);
  },
);
