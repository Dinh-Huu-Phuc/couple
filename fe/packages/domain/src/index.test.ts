import { describe, expect, it } from "vitest";
import {
  safeNext,
  photoSchema,
  wishInputSchema,
  RequestKeys,
  money,
  discussionInputSchema,
  deferTimeSchema,
} from "./index";
describe("redirect boundary", () => {
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/\nevil.test"])(
    "rejects external or ambiguous target %s",
    (target) => expect(safeNext(target)).toBe("/home"),
  );
  it("preserves an invite through authentication", () =>
    expect(safeNext("/connect?code=ABCDEFGH23")).toBe(
      "/connect?code=ABCDEFGH23",
    ));
});

describe("draw replies and chosen schedules", () => {
  it("requires a nonblank reply and enforces the length limit", () => {
    expect(discussionInputSchema.safeParse("   ").success).toBe(false);
    expect(discussionInputSchema.safeParse("x".repeat(1001)).success).toBe(
      false,
    );
  });
  it("trims a reply without interpreting HTML", () => {
    expect(
      discussionInputSchema.parse("  <b>Đi lúc hoàng hôn nhé?</b>  "),
    ).toBe("<b>Đi lúc hoàng hôn nhé?</b>");
  });
  it("rejects missing, invalid and past defer timestamps", () => {
    for (const when of ["", "not-a-date", "2000-01-01T00:00:00Z"])
      expect(deferTimeSchema.safeParse(when).success).toBe(false);
  });
  it("retains the caller's future time instead of inserting a fixed delay", () => {
    const when = new Date(Date.now() + 4 * 3600_000).toISOString();
    expect(deferTimeSchema.parse(when)).toBe(when);
  });
});
describe("wish input", () => {
  const valid = {
    title: "  Đi dạo  ",
    description: "",
    category: "date",
    budgetVnd: null,
    availableFrom: null,
    expiresAt: null,
  };
  it("trims title and distinguishes unknown from free budgets", () => {
    expect(wishInputSchema.parse(valid).title).toBe("Đi dạo");
    expect(money(null)).not.toBe(money(0));
  });
  it.each([-1, 1.5, 1_000_000_001])("rejects invalid VND %s", (budgetVnd) =>
    expect(wishInputSchema.safeParse({ ...valid, budgetVnd }).success).toBe(
      false,
    ),
  );
  it("rejects reversed availability and an expired wish", () => {
    expect(
      wishInputSchema.safeParse({
        ...valid,
        availableFrom: "2099-02-01T00:00:00Z",
        expiresAt: "2099-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      wishInputSchema.safeParse({ ...valid, expiresAt: "2000-01-01T00:00:00Z" })
        .success,
    ).toBe(false);
  });
});
describe("sensitive mutations", () => {
  it("reuses request keys after timeout and resets after success", () => {
    const keys = new RequestKeys();
    const first = keys.get("draw", { budget: 0 });
    expect(keys.get("draw", { budget: 0 })).toBe(first);
    expect(keys.get("draw", { budget: 100 })).not.toBe(first);
    keys.clear("draw", { budget: 0 });
    expect(keys.get("draw", { budget: 0 })).not.toBe(first);
  });
  it("rejects SVG/HTML and oversized photos", () => {
    expect(
      photoSchema.safeParse({ type: "image/svg+xml", size: 12 }).success,
    ).toBe(false);
    expect(
      photoSchema.safeParse({ type: "image/png", size: 5 * 1024 * 1024 + 1 })
        .success,
    ).toBe(false);
  });
});
