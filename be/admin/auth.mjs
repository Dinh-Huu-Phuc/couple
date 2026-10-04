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
/** @param {Record<string, string | undefined>} environment */
export function adminConfig(environment = process.env) {
  let username = environment.ADMIN_USERNAME;
  let password = environment.ADMIN_PASSWORD;
  let serviceKey = environment.ADMIN_BACKEND_SERVICE_ROLE_KEY;
  // Hosted/serverless deployments supply server-only environment variables.
  // Do not read or package developer env files when running on Vercel.
  if ((!username || !password || !serviceKey) && !environment.VERCEL) {
    const root =
      environment.COUPLE_BACKEND_ROOT || resolve(process.cwd(), "../../../be");
    const env = optionalEnv(resolve(root, ".env"));
    username ??= env.ADMIN_USERNAME;
    password ??= env.ADMIN_PASSWORD;
    serviceKey ??= optionalEnv(
      resolve(root, ".env.admin-runtime"),
    ).ADMIN_BACKEND_SERVICE_ROLE_KEY;
  }
  if (!username?.trim() || !password || !serviceKey)
    throw new Error("Admin backend configuration is incomplete");
  const version = createHmac("sha256", serviceKey)
    .update(username + "\0" + password)
    .digest("hex");
  return { username, password, serviceKey, version };
}
/** @param {string} path */
function optionalEnv(path) {
  try {
    return parseEnv(readFileSync(path, "utf8"));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return {};
    throw error;
  }
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
