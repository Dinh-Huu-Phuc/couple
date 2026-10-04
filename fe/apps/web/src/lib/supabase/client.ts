import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "./config";
export function browserClient() {
  const { url, key } = supabaseConfig();
  return createBrowserClient(url, key);
}
