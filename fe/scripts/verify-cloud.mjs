import { readFileSync } from "node:fs";
import { parse } from "dotenv";
const config = parse(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url)),
);
const url = config.NEXT_PUBLIC_SUPABASE_URL;
const key = config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw Error("Public environment is incomplete.");
if (
  key.startsWith("sb_secret_") ||
  (key.split(".").length === 3 &&
    JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role !== "anon")
)
  throw Error("Frontend must use a public/anon key.");
const settings = await fetch(`${url}/auth/v1/settings`, {
  headers: { apikey: key },
});
if (!settings.ok) throw Error(`Auth config read failed (${settings.status}).`);
const auth = await settings.json();
const denied = await fetch(`${url}/rest/v1/wishes?select=id&limit=1`, {
  headers: { apikey: key },
});
if (![401, 403].includes(denied.status))
  throw Error("Anonymous wish access was not denied.");
console.log(
  JSON.stringify({
    publicConfig: "PASS",
    authEndpoint: "PASS",
    emailProvider: auth.external?.email ?? null,
    anonymousWishesDenied: "PASS",
    projectHost: new URL(url).hostname,
  }),
);
