import type { Metadata } from "next";
import { appName } from "@couple/theme";
import { Providers } from "@/components/providers";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: `${appName} — Một khoảng riêng của hai mình`,
    template: `%s · ${appName}`,
  },
  description:
    "Gửi những mong muốn nhỏ, mở những niềm vui và giữ lại kỷ niệm của hai mình.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
