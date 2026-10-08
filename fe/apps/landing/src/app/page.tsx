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
          <p className="eyebrow">Một khoảng riêng của hai mình</p>
          <h1>
            Có những điều,
            <em>chỉ muốn gửi cho một người.</em>
          </h1>
          <p className="hero-description">
            Viết những điều khó nói. Mở từng mong muốn nhỏ và giữ lại những kỷ niệm muốn nhớ.
          </p>
          <div className="hero-actions">
            <a className="button" href={registerUrl}>
              Bắt đầu cho hai mình <ArrowRight aria-hidden="true" size={18} />
            </a>
            <a className="text-link" href={loginUrl}>Mình đã có tài khoản</a>
          </div>
          <p className="hero-note"><Heart aria-hidden="true" size={14} /> Một điều nhỏ hôm nay, một kỷ niệm mai sau.</p>
        </div>

        <div className="hero-art" aria-label="Một phong thư dành cho người thương" role="img">
          <span className="orbit orbit-one" />
          <span className="orbit orbit-two" />
          <span className="petal petal-one" />
          <span className="petal petal-two" />
          <span className="petal petal-three" />
          <div className="letter"><span>pour toi ♡</span></div>
          <div className="envelope">
            <span className="envelope-flap" />
            <span className="envelope-fold-left" />
            <span className="envelope-fold-right" />
            <span className="seal"><Heart aria-hidden="true" size={23} /></span>
          </div>
          <p className="hand-note">những điều<br />chỉ dành<br />cho hai mình</p>
        </div>
      </section>

      <section className="story section-shell" id="story">
        <div>
          <p className="eyebrow">Có những điều chưa biết nói thế nào</p>
          <h2>Để một chiếc thư nhỏ kể giúp cậu.</h2>
        </div>
        <p>
          COUPLE là nơi hai người gửi cho nhau những mong muốn nhỏ, cùng mở từng lá thư và lưu lại
          những khoảnh khắc đã trở thành kỷ niệm.
        </p>
      </section>

      <section className="how-section" id="how">
        <div className="section-shell">
          <p className="eyebrow centered">Từ một lời mời đến một kỷ niệm</p>
          <h2 className="section-title">Cách hai mình bắt đầu</h2>
          <div className="steps-grid">
            {steps.map(({ icon: Icon, title, body }, index) => (
              <article className="step-card" key={title}>
                <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
                <Icon aria-hidden="true" size={31} strokeWidth={1.35} />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="moment-section section-shell">
        <div className="moment-copy">
          <p className="eyebrow">Giữ lại chút dịu dàng</p>
          <h2>Khoảnh khắc của hai mình</h2>
          <p>
            Một mong muốn đã cùng thực hiện có thể trở thành kỷ niệm. Thêm một tấm ảnh, một lời nhắn
            và giữ câu chuyện ấy ở lại.
          </p>
          <a className="text-link" href={registerUrl}>Tạo khoảng riêng của hai mình <ArrowRight aria-hidden="true" size={16} /></a>
        </div>
        <div className="memory-preview" aria-label="Minh hoạ một thẻ kỷ niệm">
          <div className="memory-image"><Heart aria-hidden="true" size={38} /><em>một điều muốn nhớ</em></div>
          <div className="memory-details">
            <time dateTime="2026-10-08">08 tháng 10, 2026</time>
            <h3>Buổi chiều của hai mình</h3>
            <p>Một điều nhỏ đã trở thành một ngày thật đáng nhớ.</p>
          </div>
        </div>
      </section>

      <section className="privacy-section" id="privacy">
        <div className="section-shell privacy-layout">
          <div className="privacy-heading">
            <span className="privacy-icon"><LockKeyhole aria-hidden="true" /></span>
            <p className="eyebrow">Riêng tư từ những điều nhỏ nhất</p>
            <h2>Một khoảng riêng.<br />Chỉ hai mình.</h2>
          </div>
          <div className="privacy-list">
            <article><ShieldCheck aria-hidden="true" /><div><h3>Chỉ người đã kết nối</h3><p>Thư và kỷ niệm chỉ xuất hiện trong không gian của hai tài khoản đã ghép đôi.</p></div></article>
            <article><LockKeyhole aria-hidden="true" /><div><h3>Không công khai nội dung</h3><p>COUPLE không biến những điều riêng tư của cậu thành nội dung công khai.</p></div></article>
            <article><Trash2 aria-hidden="true" /><div><h3>Quyền xoá dữ liệu</h3><p>Cậu có thể yêu cầu xoá tài khoản cùng dữ liệu liên quan theo chính sách của ứng dụng.</p></div></article>
          </div>
        </div>
      </section>

      <section className="faq-section section-shell" id="faq">
        <div className="faq-heading">
          <p className="eyebrow">Trước khi hai mình bắt đầu</p>
          <h2>Một vài câu hỏi nhỏ</h2>
        </div>
        <div className="faq-list">
          {faqs.map(({ question, answer }) => (
            <details key={question}>
              <summary>{question}<span aria-hidden="true">＋</span></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="closing-section section-shell">
        <Heart aria-hidden="true" size={28} strokeWidth={1.3} />
        <p className="eyebrow">Một lá thư đang chờ</p>
        <h2>Cậu có một điều muốn gửi cho người ấy không?</h2>
        <div className="hero-actions centered-actions">
          <a className="button" href={registerUrl}>Tạo khoảng riêng <ArrowRight aria-hidden="true" size={18} /></a>
          <a className="text-link" href={loginUrl}>Đăng nhập</a>
        </div>
      </section>

      <footer>
        <div className="section-shell footer-layout">
          <div><a className="brand" href="#top">COUPLE <Heart aria-hidden="true" size={18} /></a><p>Một khoảng riêng. Chỉ hai mình.</p></div>
          <div className="footer-links"><a href={`${appOrigin}/register`}>Bắt đầu</a><a href={`${appOrigin}/login`}>Đăng nhập</a><a href="mailto:phucgp74@gmail.com">Email</a><a href="https://zalo.me/0398743229">Zalo</a></div>
          <p className="copyright">© 2026 COUPLE</p>
        </div>
      </footer>
    </main>
  );
}
