import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

const api = process.env.E2E_SUPABASE_URL!;
const anon = process.env.E2E_SUPABASE_ANON_KEY!;
const service = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!;
const password = "Local-couple-test-2026!";

if (!api || !["127.0.0.1", "localhost"].includes(new URL(api).hostname))
  throw new Error("Local-only test guard.");

async function post(path: string, body: unknown, token = service) {
  return fetch(`${api}${path}`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(path.startsWith("/rest/v1/rpc/") ? { "Content-Profile": "api" } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("support form, private themes, persistence and responsive navigation", async ({ page }) => {
  const email = `ui-refresh-${randomUUID()}@couple.example.test`;
  const created = await post("/auth/v1/admin/users", { email, password, email_confirm: true });
  expect(created.ok).toBe(true);
  const user = await created.json();
  try {
    const signedIn = await post("/auth/v1/token?grant_type=password", { email, password }, anon);
    expect(signedIn.ok).toBe(true);
    const token = (await signedIn.json()).access_token as string;
    const profile = await post("/rest/v1/rpc/update_my_profile", { p_display_name: "Người thử giao diện", p_timezone: "Asia/Ho_Chi_Minh" }, token);
    expect(profile.ok).toBe(true);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Vào khoảng riêng" }).click();
    await expect(page).toHaveURL(/connect/);
    await page.goto("/support");
    await expect(page.getByRole("heading", { name: "Hỗ trợ & góp ý." })).toBeVisible();
    await page.screenshot({ path: "apps/web/assets/image/support-desktop-light.png", fullPage: true });

    await page.locator(".theme-menu > summary").click();
    await page.getByRole("menuitemradio", { name: "Tối" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.screenshot({ path: "apps/web/assets/image/support-desktop-dark.png", fullPage: true });

    await page.emulateMedia({ colorScheme: "dark" });
    await page.locator(".theme-menu > summary").click();
    await page.getByRole("menuitemradio", { name: "Theo thiết bị" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.getByLabel("Tiêu đề").fill("Góp ý từ bài kiểm tra giao diện");
    await page.getByLabel("Nội dung").fill("Mình muốn xác nhận biểu mẫu góp ý được lưu và chỉ hiện cho đúng tài khoản.");
    await page.getByRole("button", { name: "Gửi góp ý" }).click();
    await expect(page.getByText("Mã tham chiếu:")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Góp ý từ bài kiểm tra giao diện" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gửi góp ý" })).not.toHaveAttribute("aria-busy", "true");

    for (const viewport of [
      { width: 320, height: 700 }, { width: 390, height: 844 },
      { width: 768, height: 1024 }, { width: 1920, height: 1080 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "apps/web/assets/image/support-mobile-dark.png", fullPage: true });
    await page.evaluate(() => localStorage.setItem("couple-theme", "light"));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator(".bottom-tabs a")).toHaveCount(4);
    await page.screenshot({ path: "apps/web/assets/image/support-mobile-light.png", fullPage: true });
  } finally {
    await fetch(`${api}/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      headers: { apikey: anon, Authorization: `Bearer ${service}` },
    });
  }
});
