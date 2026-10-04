import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
config({ path: ".env.e2e", quiet: true });
const api = process.env.E2E_SUPABASE_URL;
if (!api || !["127.0.0.1", "localhost"].includes(new URL(api).hostname))
  throw new Error(
    "E2E tests require Supabase local. Run scripts/prepare-e2e.ps1 first.",
  );
export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: {
    command:
      "corepack pnpm --filter @couple/web exec next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/login",
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      COUPLE_WEB_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_SUPABASE_URL: api,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.E2E_SUPABASE_ANON_KEY!,
      NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "false",
      ADMIN_USERNAME: "local-admin-fixture",
      ADMIN_PASSWORD: "Local-admin-console-2026!",
      ADMIN_BACKEND_SERVICE_ROLE_KEY:
        process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
    },
  },
});
