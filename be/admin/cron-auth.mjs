import { createHash, timingSafeEqual } from "node:crypto";
export function authorizesCron(secret, authorization) {
  if (typeof secret !== "string" || secret.length < 32) return false;
  const digest = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(
    digest(authorization ?? ""),
    digest(`Bearer ${secret}`),
  );
}
