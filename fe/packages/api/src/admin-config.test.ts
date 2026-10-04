import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { adminConfig } from "../../../../be/admin/auth.mjs";

const fixtureEnv = {
  ADMIN_USERNAME: "deployment-fixture-admin",
  ADMIN_PASSWORD: "Fixture-only-admin-password!",
  ADMIN_BACKEND_SERVICE_ROLE_KEY: "fixture-only-server-key",
};
const roots: string[] = [];
function backendFixture() {
  const root = mkdtempSync(join(tmpdir(), "couple-admin-config-"));
  roots.push(root);
  writeFileSync(
    join(root, ".env"),
    "ADMIN_USERNAME=local-fixture\nADMIN_PASSWORD=local-fixture-password\n",
  );
  writeFileSync(
    join(root, ".env.admin-runtime"),
    "ADMIN_BACKEND_SERVICE_ROLE_KEY=local-fixture-key\n",
  );
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + "/") &&
      !resolve(root).startsWith(resolve(tmpdir()) + "\\")
    )
      throw new Error("Fixture cleanup escaped temp directory");
    if (!root.includes("couple-admin-config-"))
      throw new Error("Unexpected fixture directory");
    rmSync(root, { recursive: true });
  }
});
describe("admin deployment configuration", () => {
  it("uses server environment without requiring any backend env files", () => {
    const config = adminConfig({
      ...fixtureEnv,
      VERCEL: "1",
      COUPLE_BACKEND_ROOT: join(tmpdir(), "nonexistent-couple-backend"),
    });
    expect(config).toMatchObject({
      username: fixtureEnv.ADMIN_USERNAME,
      password: fixtureEnv.ADMIN_PASSWORD,
      serviceKey: fixtureEnv.ADMIN_BACKEND_SERVICE_ROLE_KEY,
    });
  });
  it("preserves local backend files with environment overrides", () => {
    const config = adminConfig({
      COUPLE_BACKEND_ROOT: backendFixture(),
      ADMIN_PASSWORD: "override-fixture-password",
    });
    expect(config).toMatchObject({
      username: "local-fixture",
      password: "override-fixture-password",
      serviceKey: "local-fixture-key",
    });
  });
  it("fails closed on Vercel even if local files could supply missing credentials", () => {
    expect(() =>
      adminConfig({
        VERCEL: "1",
        COUPLE_BACKEND_ROOT: backendFixture(),
        ADMIN_USERNAME: fixtureEnv.ADMIN_USERNAME,
      }),
    ).toThrow("Admin backend configuration is incomplete");
  });
  it("invalidates old session fingerprints after a server credential rotation", () => {
    const original = adminConfig({ ...fixtureEnv, VERCEL: "1" });
    const rotated = adminConfig({
      ...fixtureEnv,
      VERCEL: "1",
      ADMIN_PASSWORD: "rotated-fixture-password",
    });
    expect(rotated.version).not.toBe(original.version);
  });
});
