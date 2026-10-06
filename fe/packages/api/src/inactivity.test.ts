import { describe, expect, it, vi } from "vitest";
import { authorizesCron } from "../../../../be/admin/cron-auth.mjs";
import { cleanInactiveAccounts } from "../../../apps/admin/src/admin/inactivity-erasure";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("inactivity cleanup protection", () => {
  it("fails closed without a strong configured secret or with the wrong bearer", () => {
    expect(authorizesCron(undefined, null)).toBe(false);
    expect(authorizesCron("short", "Bearer short")).toBe(false);
    expect(authorizesCron("s".repeat(32), null)).toBe(false);
    expect(authorizesCron("s".repeat(32), `Bearer ${"x".repeat(32)}`)).toBe(
      false,
    );
    expect(authorizesCron("s".repeat(32), `Bearer ${"s".repeat(32)}`)).toBe(
      true,
    );
  });
  it("does not call Auth or Storage when the database eligibility recheck rejects a candidate", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: ["a7100000-0000-4000-8000-000000000001"] })
      .mockResolvedValueOnce({ error: { message: "account became active" } });
    const storage = { from: vi.fn() };
    const auth = { admin: { deleteUser: vi.fn() } };
    const client = {
      schema: () => ({ rpc }),
      storage,
      auth,
    } as unknown as SupabaseClient;
    expect(await cleanInactiveAccounts(client)).toEqual({
      checked: 1,
      completed: 0,
      deferred: 1,
    });
    expect(storage.from).not.toHaveBeenCalled();
    expect(auth.admin.deleteUser).not.toHaveBeenCalled();
  });
  it("refuses malformed or unbounded candidate lists before any removal", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: ["not-a-user-id"] });
    const client = { schema: () => ({ rpc }) } as unknown as SupabaseClient;
    await expect(cleanInactiveAccounts(client)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
