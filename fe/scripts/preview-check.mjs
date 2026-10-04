import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const origin = "http://127.0.0.1:3001";
await mkdir("docs/screenshots", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const response = await page.goto(`${origin}/login`);
  if (response?.status() !== 200)
    throw Error("Production login page did not respond successfully.");
  await page.getByRole("heading", { name: "Chào cậu." }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "docs/screenshots/login-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  if (
    !(await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ))
  )
    throw Error("Mobile page overflows.");
  await page.screenshot({
    path: "docs/screenshots/login-mobile.png",
    fullPage: true,
  });
  await page.goto(`${origin}/connect?code=ABCDEFGH23`);
  if (
    new URL(page.url()).pathname !== "/login" ||
    new URL(page.url()).searchParams.get("next") !== "/connect?code=ABCDEFGH23"
  )
    throw Error("Private route did not preserve invitation.");
  console.log(
    "Production preview: login desktop/mobile and private-route invitation checks PASS.",
  );
} finally {
  await browser.close();
}
