import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
export const dynamic = "force-dynamic";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = await serverClient();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect("/login");
  return (
    <AppShell userId={data.user.id} email={data.user.email ?? ""}>
      {children}
    </AppShell>
  );
}
