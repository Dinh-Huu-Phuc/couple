// Node backend only. Imported exclusively by Next server-only admin handlers.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const SESSION_SECONDS = 3600;
export function adminConfig() {
  const root =
    process.env.COUPLE_BACKEND_ROOT || resolve(process.cwd(), "../../../be");
  const env = parseEnv(readFileSync(resolve(root, ".env"), "utf8"));
  let serviceKey = process.env.ADMIN_BACKEND_SERVICE_ROLE_KEY;
  if (!serviceKey)
    serviceKey = parseEnv(
      readFileSync(resolve(root, ".env.admin-runtime"), "utf8"),
    ).ADMIN_BACKEND_SERVICE_ROLE_KEY;
  const username = process.env.ADMIN_USERNAME ?? env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD ?? env.ADMIN_PASSWORD;
  if (!username?.trim() || !password || !serviceKey)
    throw new Error("Admin backend configuration is incomplete");
  const version = createHmac("sha256", serviceKey)
    .update(username + "\0" + password)
    .digest("hex");
  return { username, password, serviceKey, version };
}
/** @param {string} value */
export function hashToken(value) {
  return createHash("sha256").update(value).digest("hex");
}
export function newToken() {
  return randomBytes(32).toString("hex");
}
/** @param {{username:string,password:string}} config @param {string} username @param {string} password */
export function matchCredentials(config, username, password) {
  const nameMatches = timingSafeEqual(
    Buffer.from(hashToken(username)),
    Buffer.from(hashToken(config.username)),
  );
  const passwordMatches = timingSafeEqual(
    Buffer.from(hashToken(password)),
    Buffer.from(hashToken(config.password)),
  );
  return nameMatches && passwordMatches;
}
