import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const origin = process.env.E2E_SUPABASE_URL!;
const anon = process.env.E2E_SUPABASE_ANON_KEY!;
const service = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!;
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw Error("Local only");
const password = "Local-letters-chat-2026!";
async function post(path: string, body: unknown, token: string, rpc = false) {
  const result = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(rpc ? { "Content-Profile": "api" } : {}),
    },
    body: JSON.stringify(body),
  });
  expect(result.ok).toBe(true);
  return result.json();
}
async function account() {
  const email = `letters-${randomUUID()}@example.test`;
  const user = await post(
    "/auth/v1/admin/users",
    { email, password, email_confirm: true },
    service,
  );
  const auth = await post(
    "/auth/v1/token?grant_type=password",
    { email, password },
    anon,
  );
  await post(
    "/rest/v1/rpc/update_my_profile",
    { p_display_name: "Người thử", p_timezone: "Asia/Ho_Chi_Minh" },
    auth.access_token,
    true,
  );
  return { email, id: user.id, token: auth.access_token };
}
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Vào khoảng riêng" }).click();
  await expect(page).toHaveURL(/\/(home|connect)(\?|$)/);
}

test("letter draft and private photos survive reload; paired chat sends photos and disappears on disconnect", async ({
  browser,
}) => {
  const a = await account();
  const b = await account();
  const invite = await post(
    "/rest/v1/rpc/create_invite",
    { p_request_id: randomUUID() },
    a.token,
    true,
  );
  const request = await post(
    "/rest/v1/rpc/request_connection",
    { p_code: invite.data.code, p_request_id: randomUUID() },
    b.token,
    true,
  );
  const paired = await post(
    "/rest/v1/rpc/respond_connection",
    {
      p_connection_request_id: request.data.connectionRequestId,
      p_response: "accept",
    },
    a.token,
    true,
  );
  expect(paired.ok).toBe(true);
  const ca = await browser.newContext();
  const cb = await browser.newContext();
  const pa = await ca.newPage();
  const pb = await cb.newPage();
  const photoBytes = await pa.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f2c7cc";
    context.fillRect(0, 0, 320, 240);
    context.fillStyle = "#914457";
    context.font = "28px sans-serif";
    context.fillText("Couple test", 75, 130);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const photo = {
    name: "test.png",
    mimeType: "image/png",
    buffer: Buffer.from(photoBytes, "base64"),
  };
  try {
    await login(pa, a.email);
    await login(pb, b.email);
    await pa.goto("/wishes");
    await pa.getByRole("button", { name: "Viết mong muốn" }).click();
    await pa.getByLabel("Tên mong muốn").fill("Lá thư thử riêng tư");
    await pa
      .getByLabel("Nội dung lá thư", { exact: true })
      .fill("Thương cậu nhiều.\nMột chiều đi dạo cùng nhau.");
    await pa.getByLabel("Mẫu giấy").selectOption("rose");
    await pa.locator(".letter-photo-picker input").setInputFiles(photo);
    for (const width of [360, 390, 768, 1280]) {
      await pa.setViewportSize({ width, height: 900 });
      expect(
        await pa.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await pa.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(
      pa.getByText("Đã lưu nháp riêng tư.", { exact: false }),
    ).toBeVisible();
    await pa.reload();
    await pa.getByRole("button", { name: "Viết mong muốn" }).click();
    await expect(pa.getByLabel("Tên mong muốn")).toHaveValue(
      "Lá thư thử riêng tư",
    );
    await expect(pa.getByAltText("Ảnh đính kèm lá thư")).toBeVisible();
    await pa.screenshot({
      path: "test-results/letter-editor-desktop.png",
      fullPage: true,
    });
    await pa.getByRole("button", { name: "Gửi vào hộp của tớ" }).click();
    await expect(
      pa.getByRole("heading", { name: "Lá thư thử riêng tư" }),
    ).toBeVisible();
    await pb.goto("/home");
    await pb.getByRole("button", { name: "Bốc một mong muốn" }).click();
    await expect(
      pb.getByRole("heading", { name: "Lá thư thử riêng tư" }),
    ).toBeVisible();
    await expect(pb.locator(".letter-photo img")).toBeVisible();
    await pb.getByRole("button", { name: "Chữ dễ đọc" }).click();
    await expect(pb.locator(".letter-easy-read")).toBeVisible();
    await pb.getByRole("button", { name: /Xem ảnh lớn/ }).click();
    await expect(
      pb.getByRole("heading", { name: "Bức ảnh của hai mình" }),
    ).toBeVisible();
    await pb.getByRole("button", { name: "Đóng", exact: true }).click();
    await pa.goto("/chat");
    await pb.goto("/chat");
    await pa
      .getByLabel("Tin nhắn", { exact: true })
      .fill("Một lời nhỏ gửi cậu");
    await pa.locator(".chat-photo-picker input").setInputFiles(photo);
    await pa.getByRole("button", { name: "Gửi tin nhắn", exact: true }).click();
    await expect(
      pb.getByText("Một lời nhỏ gửi cậu", { exact: true }),
    ).toBeVisible();
    await expect(pb.getByAltText("Ảnh gửi trong trò chuyện")).toBeVisible();
    await pb.getByLabel("Tin nhắn", { exact: true }).fill("Tớ nhận được rồi");
    await pb.getByRole("button", { name: "Gửi tin nhắn", exact: true }).click();
    await expect(
      pa.getByText("Tớ nhận được rồi", { exact: true }),
    ).toBeVisible();
    for (const width of [360, 390, 768, 1280]) {
      await pb.setViewportSize({ width, height: 900 });
      expect(
        await pb.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await pb.setViewportSize({ width: 390, height: 844 });
    await pb.screenshot({
      path: "test-results/chat-mobile.png",
      fullPage: true,
    });
    const ended = await post(
      "/rest/v1/rpc/end_couple",
      { p_couple_id: paired.data.coupleId, p_request_id: randomUUID() },
      a.token,
      true,
    );
    expect(ended.ok).toBe(true);
    await pa.reload();
    await expect(pa).toHaveURL(/connect/);
    const messages = await fetch(
      `${origin}/rest/v1/chat_messages?select=id&couple_id=eq.${paired.data.coupleId}`,
      { headers: { apikey: anon, Authorization: `Bearer ${a.token}` } },
    );
    expect(messages.ok).toBe(true);
    expect(await messages.json()).toEqual([]);
  } finally {
    await ca.close();
    await cb.close();
  }
});

test("self-deletion rejects a wrong password and removes only the authenticated account", async ({
  page,
}) => {
  const user = await account();
  await login(page, user.email);
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Xem thông tin xoá tài khoản" })
    .click();
  await page.getByLabel("Email xác nhận").fill(user.email);
  await page.getByLabel("Mật khẩu hiện tại").fill("Wrong-password-fixture!");
  await page
    .getByLabel("Nhập “XOÁ TÀI KHOẢN” để xác nhận")
    .fill("XOÁ TÀI KHOẢN");
  await page
    .getByRole("button", { name: "Xác nhận xoá tài khoản", exact: true })
    .click();
  await expect(
    page.getByText("Mật khẩu chưa đúng. Cậu xác nhận lại trước khi xoá nhé."),
  ).toBeVisible();
  await page.getByLabel("Mật khẩu hiện tại").fill(password);
  await page
    .getByRole("button", { name: "Xác nhận xoá tài khoản", exact: true })
    .click();
  await expect(page).toHaveURL(/login\?account=deleted/);
  const missing = await fetch(`${origin}/auth/v1/admin/users/${user.id}`, {
    headers: { apikey: anon, Authorization: `Bearer ${service}` },
  });
  expect(missing.status).toBe(404);
});
