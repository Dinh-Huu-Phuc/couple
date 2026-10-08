"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { ThemeProvider } from "./theme";
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 10_000, refetchOnWindowFocus: true },
          mutations: { retry: false },
        },
      }),
  );
  const router = useRouter();
  useEffect(() => {
    let actor: string | null | undefined;
    const {
      data: { subscription },
    } = browserClient().auth.onAuthStateChange((event, session) => {
      const next = session?.user.id ?? null;
      if (actor !== undefined && next !== actor) {
        void queryClient.cancelQueries();
        queryClient.clear();
        router.refresh();
      }
      actor = next;
      if (event === "SIGNED_OUT") {
        void queryClient.cancelQueries();
        queryClient.clear();
        router.replace("/login");
        router.refresh();
      }
    });
    return () => subscription.unsubscribe();
  }, [queryClient, router]);
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
