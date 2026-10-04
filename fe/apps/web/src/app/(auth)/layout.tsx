import Link from "next/link";
import { Heart, ArrowUpRight } from "lucide-react";
import { Envelope } from "@/components/ui";
import { appName } from "@couple/theme";
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Link href="/" className="wordmark">
          {appName}
          <Heart size={19} />
        </Link>
        <div className="story-content">
          <span className="eyebrow">MỘT KHOẢNG RIÊNG CỦA HAI MÌNH</span>
          <h1>
            Yêu thương,
            <br />
            từ những
            <br />
            <em>điều nhỏ.</em>
          </h1>
          <p>
            Có những điều chưa biết nói thế nào.
            <br />
            Để một chiếc thư nhỏ kể giúp cậu.
          </p>
          <Envelope />
          <div className="story-note">
            Viết một mong muốn. Mở một niềm vui.
            <Heart size={15} />
          </div>
        </div>
        <div className="story-footer">
          Chỉ hai mình, và những điều muốn nhớ.
          <ArrowUpRight size={18} />
        </div>
      </section>
      <main className="auth-main">
        <div className="mobile-brand wordmark">
          {appName}
          <Heart size={17} />
        </div>
        {children}
        <p className="auth-footnote">
          Một điều nhỏ hôm nay, một kỷ niệm mai sau.
        </p>
      </main>
    </div>
  );
}
