import type { Metadata } from "next";
import { SelfXssWarning } from "../components/self-xss-warning";
import "./fonts.css";
import "./globals.css";

const siteUrl = "https://coupleletters.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "COUPLE — Một khoảng riêng của hai mình",
  description:
    "COUPLE là một khoảng riêng để hai người viết những điều khó nói, mở từng mong muốn và giữ lại những kỷ niệm muốn nhớ.",
  keywords: ["COUPLE", "coupleletters", "thư tình", "kỷ niệm đôi", "mong muốn cho hai người"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "vi_VN",
    url: siteUrl,
    siteName: "COUPLE",
    title: "COUPLE — Một khoảng riêng của hai mình",
    description: "Viết những điều khó nói. Giữ những kỷ niệm muốn nhớ.",
  },
  twitter: {
    card: "summary_large_image",
    title: "COUPLE — Một khoảng riêng của hai mình",
    description: "Viết những điều khó nói. Giữ những kỷ niệm muốn nhớ.",
  },
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body><SelfXssWarning />{children}</body>
    </html>
  );
}
