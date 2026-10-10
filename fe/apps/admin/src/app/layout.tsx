import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { SelfXssWarning } from "@/components/self-xss-warning";
import "./globals.css";

export const metadata: Metadata = {
  title: "COUPLE · Quản trị",
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body><SelfXssWarning /><Providers>{children}</Providers></body></html>;
}
