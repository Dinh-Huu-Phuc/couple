import Image from "next/image";
import {
  ArrowRight,
  Bookmark,
  Heart,
  HeartHandshake,
  LockKeyhole,
  MailOpen,
  PenLine,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  LandingMotionProvider,
  ParallaxPetal,
  Reveal,
} from "../components/landing-motion";

const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.coupleletters.app";

const steps = [
  {
    icon: HeartHandshake,
    title: "Kết nối",
    body: "Tạo một khoảng chung chỉ dành cho hai mình.",
  },
  {
    icon: PenLine,
    title: "Viết điều muốn gửi",
    body: "Gửi một mong muốn, tâm sự hay điều nhỏ muốn cùng làm.",
  },
  {
    icon: MailOpen,
    title: "Bốc một mong muốn",
    body: "Mỗi lần mở một lá thư và cùng nhau làm điều bất ngờ.",
  },
  {
    icon: Bookmark,
    title: "Giữ lại kỷ niệm",
    body: "Lưu những khoảnh khắc đẹp thành câu chuyện của hai mình.",
  },
];

const faqs = [
  {
    question: "Hai người có cần hai tài khoản không?",
    answer: "Có. Mỗi người dùng một tài khoản riêng rồi kết nối với nhau bằng mã của COUPLE.",
  },
  {
    question: "Người lạ có thể đọc thư của hai mình không?",
    answer: "Không. Nội dung chỉ hiển thị trong kết nối riêng của hai tài khoản đã ghép đôi.",
  },
  {
    question: "Điều gì xảy ra khi một người xoá tài khoản?",
    answer:
      "Tài khoản, thư, ảnh và những kỷ niệm chung liên quan sẽ được xoá theo chính sách của COUPLE.",
  },
  {
    question: "Mình có thể liên hệ với COUPLE ở đâu?",
    answer: "Cậu có thể gửi góp ý trong ứng dụng hoặc liên hệ qua email và Zalo ở cuối trang.",
  },
];

export default function LandingPage() {
  const registerUrl = `${appOrigin}/register`;
  const loginUrl = `${appOrigin}/login`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "COUPLE",
    url: "https://coupleletters.app",
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web",
    description:
      "Một khoảng riêng để hai người viết những điều khó nói và giữ lại những kỷ niệm muốn nhớ.",
  };

  return (
    <main>
      <LandingMotionProvider>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <header className="site-header">
        <a className="brand" href="#top" aria-label="COUPLE — về đầu trang">
          COUPLE <Heart aria-hidden="true" size={20} strokeWidth={1.5} />
        </a>
        <nav aria-label="Điều hướng chính">
          <a href="#story">Về COUPLE</a>
          <a href="#how">Cách bắt đầu</a>
          <a href="#privacy">Riêng tư</a>
          <a href="#faq">Câu hỏi</a>
        </nav>
        <div className="header-actions">
          <a className="login-link" href={loginUrl}>Đăng nhập</a>
          <a className="button button-small" href={registerUrl}>Bắt đầu viết</a>
        </div>
      </header>

      <section className="hero section-shell" id="top">
        <div className="hero-copy">
          <Reveal className="hero-intro">
            <p className="eyebrow">Một khoảng riêng của hai mình</p>
            <h1>
              Có những điều,
              <em>chỉ muốn gửi cho một người.</em>
            </h1>
            <p className="hero-description">
              Viết những điều khó nói. Mở từng mong muốn nhỏ và giữ lại những kỷ niệm muốn nhớ.
            </p>
          </Reveal>
          <div className="hero-actions">
            <a className="button" href={registerUrl}>
              Bắt đầu cho hai mình <ArrowRight aria-hidden="true" size={18} />
            </a>
            <a className="text-link" href={loginUrl}>Mình đã có tài khoản</a>
          </div>
          <p className="hero-note"><Heart aria-hidden="true" size={14} /> Một điều nhỏ hôm nay, một kỷ niệm mai sau.</p>
        </div>

        <Reveal
          className="hero-art"
          preset="softScale"
          ariaLabel="Một phong thư dành cho người thương"
          role="img"
        >
          <span className="orbit orbit-one" />
          <span className="orbit orbit-two" />
          <ParallaxPetal className="petal petal-one" distance={18} rotate={35} />
          <ParallaxPetal className="petal petal-two" distance={12} rotate={-38} scale={0.75} />
          <ParallaxPetal className="petal petal-three" distance={10} rotate={42} scale={0.6} />
          <div className="letter"><span>pour toi ♡</span></div>
          <div className="envelope">
            <span className="envelope-flap" />
            <span className="envelope-fold-left" />
            <span className="envelope-fold-right" />
            <span className="seal"><Heart aria-hidden="true" size={23} /></span>
          </div>
          <p className="hand-note">những điều<br />chỉ dành<br />cho hai mình</p>
        </Reveal>
      </section>

      <section className="story section-shell" id="story">
        <Reveal>
          <p className="eyebrow">Có những điều chưa biết nói thế nào</p>
          <h2>Để một chiếc thư nhỏ kể giúp cậu.</h2>
        </Reveal>
        <Reveal className="story-text" delay={0.08}>
          <p>
            COUPLE là nơi hai người gửi cho nhau những mong muốn nhỏ, cùng mở từng lá thư và lưu lại
            những khoảnh khắc đã trở thành kỷ niệm.
          </p>
        </Reveal>
      </section>

      <section className="how-section" id="how">
        <div className="section-shell">
          <Reveal>
            <p className="eyebrow centered">Từ một lời mời đến một kỷ niệm</p>
            <h2 className="section-title">Cách hai mình bắt đầu</h2>
          </Reveal>
          <div className="steps-grid">
            {steps.map(({ icon: Icon, title, body }, index) => (
              <Reveal
                as="article"
                className="step-card"
                delay={index * 0.07}
                key={title}
                preset="softScale"
              >
                <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
                <Icon aria-hidden="true" size={31} strokeWidth={1.35} />
                <h3>{title}</h3>
                <p>{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="moment-section section-shell">
        <Reveal className="moment-copy" preset="slideRight">
          <p className="eyebrow">Giữ lại chút dịu dàng</p>
          <h2>Khoảnh khắc của hai mình</h2>
          <p>
            Một mong muốn đã cùng thực hiện có thể trở thành kỷ niệm. Thêm một tấm ảnh, một lời nhắn
            và giữ câu chuyện ấy ở lại.
          </p>
          <a className="text-link" href={registerUrl}>Tạo khoảng riêng của hai mình <ArrowRight aria-hidden="true" size={16} /></a>
        </Reveal>
        <Reveal
          className="memory-preview"
          preset="slideLeft"
          delay={0.08}
          ariaLabel="Minh hoạ một thẻ kỷ niệm"
        >
          <div className="memory-image"><Heart aria-hidden="true" size={38} /><em>một điều muốn nhớ</em></div>
          <div className="memory-details">
            <time dateTime="2026-10-08">08 tháng 10, 2026</time>
            <h3>Buổi chiều của hai mình</h3>
            <p>Một điều nhỏ đã trở thành một ngày thật đáng nhớ.</p>
          </div>
        </Reveal>
      </section>

      <section className="privacy-section" id="privacy">
        <div className="section-shell privacy-layout">
          <Reveal className="privacy-heading">
            <span className="privacy-icon"><LockKeyhole aria-hidden="true" /></span>
            <p className="eyebrow">Riêng tư từ những điều nhỏ nhất</p>
            <h2>Một khoảng riêng.<br />Chỉ hai mình.</h2>
          </Reveal>
          <div className="privacy-list">
            <Reveal as="article" delay={0}><ShieldCheck aria-hidden="true" /><div><h3>Chỉ người đã kết nối</h3><p>Thư và kỷ niệm chỉ xuất hiện trong không gian của hai tài khoản đã ghép đôi.</p></div></Reveal>
            <Reveal as="article" delay={0.07}><LockKeyhole aria-hidden="true" /><div><h3>Không công khai nội dung</h3><p>COUPLE không biến những điều riêng tư của cậu thành nội dung công khai.</p></div></Reveal>
            <Reveal as="article" delay={0.14}><Trash2 aria-hidden="true" /><div><h3>Quyền xoá dữ liệu</h3><p>Cậu có thể yêu cầu xoá tài khoản cùng dữ liệu liên quan theo chính sách của ứng dụng.</p></div></Reveal>
          </div>
        </div>
      </section>

      <section className="faq-section section-shell" id="faq">
        <Reveal className="faq-heading">
          <p className="eyebrow">Trước khi hai mình bắt đầu</p>
          <h2>Một vài câu hỏi nhỏ</h2>
        </Reveal>
        <Reveal className="faq-list" delay={0.08}>
          {faqs.map(({ question, answer }) => (
            <details key={question}>
              <summary>{question}<span aria-hidden="true">＋</span></summary>
              <p>{answer}</p>
            </details>
          ))}
        </Reveal>
      </section>

      <section className="closing-section section-shell">
        <Reveal className="closing-intro">
          <Heart aria-hidden="true" size={28} strokeWidth={1.3} />
          <p className="eyebrow">Một lá thư đang chờ</p>
          <h2>Cậu có một điều muốn gửi cho người ấy không?</h2>
        </Reveal>
        <div className="hero-actions centered-actions">
          <a className="button" href={registerUrl}>Tạo khoảng riêng <ArrowRight aria-hidden="true" size={18} /></a>
          <a className="text-link" href={loginUrl}>Đăng nhập</a>
        </div>
      </section>

      <footer>
        <div className="section-shell footer-layout">
          <div><a className="brand" href="#top">COUPLE <Heart aria-hidden="true" size={18} /></a><p>Một khoảng riêng. Chỉ hai mình.</p></div>
          <div className="footer-links">
            <a href={`${appOrigin}/register`}>Bắt đầu</a>
            <a href={`${appOrigin}/login`}>Đăng nhập</a>
            <a className="footer-contact-link" href="mailto:phucgp74@gmail.com">
              <Image
                className="footer-email-icon"
                src="/icons/envelope-regular-full.svg"
                alt=""
                width={18}
                height={18}
              />
              <span>Email</span>
            </a>
            <a
              className="footer-contact-link"
              href="https://zalo.me/0398743229"
              target="_blank"
              rel="noopener noreferrer"
            >
              <i className="fab-vn fab-vn-zalo" aria-hidden="true">Zalo</i>
              <span>Zalo</span>
            </a>
          </div>
          <p className="copyright">© 2026 COUPLE</p>
        </div>
      </footer>
      </LandingMotionProvider>
    </main>
  );
}
