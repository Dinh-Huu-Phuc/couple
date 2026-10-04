import { describe, expect, it } from "vitest";
import { readBoundedJson } from "../../../../be/admin/read-json.mjs";

function streamedBody(chunks: Uint8Array[], contentLength?: string) {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("http://localhost/admin/api/login", {
    method: "POST",
    body,
    duplex: "half",
    headers: contentLength ? { "content-length": contentLength } : {},
  } as RequestInit);
  return { request, cancelled: () => cancelled };
}
const bytes = (value: string) => new TextEncoder().encode(value);
describe("admin request body boundary", () => {
  it("accepts UTF-8 JSON split across transport chunks", async () => {
    const data = bytes(
      JSON.stringify({ username: "Tài khoản", password: "example" }),
    );
    const { request } = streamedBody([data.slice(0, 15), data.slice(15)]);
    expect(await readBoundedJson(request)).toEqual({
      username: "Tài khoản",
      password: "example",
    });
  });
  it("rejects an oversized chunked body with no Content-Length", async () => {
    const fixture = streamedBody([
      bytes(" ".repeat(5000)),
      bytes(" ".repeat(5000)),
      bytes("{}"),
    ]);
    expect(await readBoundedJson(fixture.request)).toBeNull();
    expect(fixture.cancelled()).toBe(true);
  });
  it("counts actual bytes when Content-Length lies", async () => {
    const { request } = streamedBody(
      [bytes(JSON.stringify({ password: "x".repeat(9000) }))],
      "2",
    );
    expect(await readBoundedJson(request)).toBeNull();
  });
  it("rejects malformed JSON and invalid UTF-8 without leaking parse errors", async () => {
    expect(
      await readBoundedJson(streamedBody([bytes("{")]).request),
    ).toBeNull();
    expect(
      await readBoundedJson(streamedBody([new Uint8Array([0xff])]).request),
    ).toBeNull();
  });
});
