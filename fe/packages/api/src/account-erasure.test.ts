import { describe, expect, it, vi } from "vitest";
import {
  eraseAccount,
  type ErasurePort,
} from "../../../../be/supabase/functions/delete-account/erasure";
import { deletionRowSchema } from "../../../apps/admin/src/admin/operations-data";

const id = "a7100000-0000-4000-8000-000000000001";
function fixture(
  files = [{ bucket: "couple-memories", name: "fixture-photo" }],
) {
  const calls: string[] = [];
  const port: ErasurePort = {
    prepare: vi.fn(async () => ({ id, files })),
    removeFiles: vi.fn(async () => {
      calls.push("storage");
    }),
    markFilesRemoved: vi.fn(async () => {
      calls.push("verified");
    }),
    deleteUser: vi.fn(async () => {
      calls.push("auth");
    }),
    userIsMissing: vi.fn(async () => false),
    recordFailure: vi.fn(async () => {}),
  };
  return { port, calls };
}
describe("account erasure boundaries", () => {
  it("removes bytes and verifies the manifest before deleting Auth", async () => {
    const { port, calls } = fixture();
    expect(await eraseAccount(port, id)).toBe(true);
    expect(calls).toEqual(["storage", "verified", "auth"]);
    expect(port.removeFiles).toHaveBeenCalledWith("couple-memories", [
      "fixture-photo",
    ]);
  });
  it("does not mark files ready or delete Auth after a Storage failure", async () => {
    const { port } = fixture();
    vi.mocked(port.removeFiles).mockRejectedValueOnce(new Error("outage"));
    expect(await eraseAccount(port, id)).toBe(false);
    expect(port.markFilesRemoved).not.toHaveBeenCalled();
    expect(port.deleteUser).not.toHaveBeenCalled();
    expect(port.recordFailure).toHaveBeenCalledWith(id, "storage");
    expect(await eraseAccount(port, id)).toBe(true);
  });
  it("does not delete Auth if DB detects remaining objects", async () => {
    const { port } = fixture();
    vi.mocked(port.markFilesRemoved).mockRejectedValueOnce(
      new Error("still present"),
    );
    expect(await eraseAccount(port, id)).toBe(false);
    expect(port.deleteUser).not.toHaveBeenCalled();
    expect(port.recordFailure).toHaveBeenCalledWith(id, "database");
  });
  it("keeps an Auth failure retryable while the user still exists", async () => {
    const { port } = fixture();
    vi.mocked(port.deleteUser).mockRejectedValueOnce(new Error("outage"));
    expect(await eraseAccount(port, id)).toBe(false);
    expect(port.recordFailure).toHaveBeenCalledWith(id, "auth");
  });
  it("accepts a lost response only after confirming the user is absent", async () => {
    const { port } = fixture();
    vi.mocked(port.deleteUser).mockRejectedValueOnce(
      new Error("response lost"),
    );
    vi.mocked(port.userIsMissing).mockResolvedValueOnce(true);
    expect(await eraseAccount(port, id)).toBe(true);
    expect(port.recordFailure).not.toHaveBeenCalled();
  });
  it("refuses manifests targeting the legacy archive or another bucket", async () => {
    const { port } = fixture([
      { bucket: "deleted-data", name: "legacy-photo" },
    ]);
    expect(await eraseAccount(port, id)).toBe(false);
    expect(port.removeFiles).not.toHaveBeenCalled();
    expect(port.deleteUser).not.toHaveBeenCalled();
  });
  it("deduplicates and batches more than 100 file removals", async () => {
    const files = Array.from({ length: 101 }, (_, i) => ({
      bucket: "couple-memories",
      name: `photo-${i}`,
    }));
    const { port } = fixture([...files, files[0]]);
    expect(await eraseAccount(port, id)).toBe(true);
    expect(port.removeFiles).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(port.removeFiles).mock.calls.map(([, names]) => names.length),
    ).toEqual([100, 1]);
  });
  it("strips old RPC content, identities and paths before an admin response", () => {
    const row = deletionRowSchema.parse({
      id,
      status: "completed",
      created_at: "2026-10-05T00:00:00Z",
      completed_at: "2026-10-05T01:00:00Z",
      email: "private@example.test",
      display_name: "Private name",
      source_user_id: id,
      payload: { wishes: ["private letter"] },
      files: [{ archiveKey: "private-path" }],
    });
    expect(row).not.toHaveProperty("email");
    expect(row).not.toHaveProperty("display_name");
    expect(row).not.toHaveProperty("source_user_id");
    expect(row).not.toHaveProperty("payload");
    expect(row).not.toHaveProperty("files");
  });
});
