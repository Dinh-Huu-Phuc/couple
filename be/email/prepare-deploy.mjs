// Generate a self-contained CLI workdir from the minimal Auth manifest.
// Developer env files and SMTP/admin credentials are never copied into it.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const backend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(backend, "md/production-auth-deploy");
mkdirSync(resolve(target, "supabase"), { recursive: true });
copyFileSync(
  resolve(backend, "deploy/production-auth/supabase/config.toml"),
  resolve(target, "supabase/config.toml"),
);
console.log("Prepared production Auth configuration in be/md/production-auth-deploy");
