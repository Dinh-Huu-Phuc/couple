import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function Page() {
  const client = await serverClient();
  const { data } = await client.auth.getClaims();
  redirect(data?.claims ? "/home" : "/login");
}
