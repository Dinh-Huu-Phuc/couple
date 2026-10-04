import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rpc } from "./index";

function fixture(data: unknown, error: unknown = null) {
  const call = vi.fn().mockResolvedValue({ data, error });
  const schema = vi.fn().mockReturnValue({ rpc: call });
  return { client: { schema } as unknown as SupabaseClient, call, schema };
}
describe("RPC trust boundary", () => {
  it("uses the api schema and validates successful payloads", async () => {
    const f = fixture({ ok: true, data: { count: 2 } });
    await expect(
      rpc(f.client, "test", { p_id: "x" }, z.object({ count: z.number() })),
    ).resolves.toEqual({ count: 2 });
    expect(f.schema).toHaveBeenCalledWith("api");
    expect(f.call).toHaveBeenCalledWith("test", { p_id: "x" });
  });
  it("rejects malformed envelopes and payloads", async () => {
    for (const response of [
      null,
      { ok: true, data: "wrong" },
      { ok: "true" },
    ]) {
      await expect(
        rpc(fixture(response).client, "test", {}, z.number()),
      ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });
  it("preserves business errors and retry timing", async () => {
    const f = fixture({
      ok: false,
      error: { code: "RATE_LIMITED", retryAfterSeconds: 42 },
    });
    await expect(rpc(f.client, "test", {}, z.unknown())).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: 42,
    });
  });
  it("does not surface database error details", async () => {
    await expect(
      rpc(
        fixture(null, { code: "PGRST301", message: "internal" }).client,
        "test",
        {},
        z.unknown(),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(
      rpc(
        fixture(null, { code: "XX000", message: "internal" }).client,
        "test",
        {},
        z.unknown(),
      ),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});
