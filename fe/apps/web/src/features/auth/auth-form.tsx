"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { ArrowRight, Eye, EyeOff, Heart, Mail } from "lucide-react";
import { safeNext, AppError } from "@couple/domain";
import { browserClient } from "@/lib/supabase/client";
import { Button, Notice } from "@/components/ui";
type Mode = "login" | "register" | "forgot" | "reset" | "verify";
const titles = {
  login: "Chào cậu, mừng cậu về.",
  register: "Bắt đầu câu chuyện của hai mình.",
  forgot: "Tìm lại chiếc chìa khóa.",
  reset: "Một mật khẩu mới nhé.",
  verify: "Một lá thư đang chờ cậu.",
};
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [ready, setReady] = useState(mode !== "reset");
  useEffect(() => {
    if (mode === "reset")
      void browserClient()
        .auth.getUser()
        .then(({ data }) => {
          setReady(!!data.user);
          if (!data.user) setError(new AppError("otp_expired"));
        });
  }, [mode]);
  const authLink = (route: string) =>
    `${route}?next=${encodeURIComponent(next)}`;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    setMessage("");
    if (busy) return;
    if (
      (mode === "register" || mode === "reset") &&
      password !== confirmation
    ) {
      setMessage("Hai lần nhập mật khẩu chưa khớp.");
      return;
    }
    setBusy(true);
    const client = browserClient();
    const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    try {
      if (mode === "login") {
        const { error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        window.location.assign(next);
      }
      if (mode === "register") {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: callback },
        });
        if (error) throw error;
        if (data.session) window.location.assign(next);
        else {
          setSent(true);
          setPassword("");
          setConfirmation("");
        }
      }
      if (mode === "forgot") {
        const { error } = await client.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
          },
        );
        if (error) throw error;
        setSent(true);
      }
      if (mode === "reset") {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        setPassword("");
        setConfirmation("");
        router.replace("/home");
        router.refresh();
      }
      if (mode === "verify") {
        const { error } = await client.auth.resend({
          type: "signup",
          email: email.trim(),
          options: { emailRedirectTo: callback },
        });
        if (error) throw error;
        setMessage(
          "Nếu tài khoản cần xác nhận, thư mới đã được gửi. Cậu kiểm tra hộp thư và thư rác nhé.",
        );
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError(undefined);
    const { error } = await browserClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error);
      setBusy(false);
    }
  }
  if (sent)
    return (
      <section className="auth-card confirmation">
        <span className="icon-tile">
          <Mail size={28} />
        </span>
        <span className="eyebrow">KIỂM TRA HỘP THƯ CỦA CẬU</span>
        <h2>
          {mode === "forgot"
            ? "Đường về đã được gửi."
            : "Chỉ còn một bước nhỏ."}
        </h2>
        <p>
          {mode === "forgot"
            ? "Nếu email có tài khoản, cậu sẽ nhận được liên kết đặt lại mật khẩu."
            : `Cậu mở thư gửi tới ${email} để xác nhận tài khoản nhé.`}
        </p>
        <p className="muted">
          Nhớ kiểm tra cả thư rác. Mở liên kết trong cùng trình duyệt để tiếp
          tục.
        </p>
        <Link className="button" href={authLink("/login")}>
          Về đăng nhập
          <ArrowRight size={18} />
        </Link>
        <Link href={authLink("/verify-email")} className="text-button">
          Gửi lại email xác nhận
        </Link>
      </section>
    );
  return (
    <section className="auth-card">
      <span className="eyebrow">
        <Heart size={12} />{" "}
        {mode === "login" ? "NGƯỜI THƯƠNG ĐANG CHỜ" : "MỘT KHỞI ĐẦU DỊU DÀNG"}
      </span>
      <h2>{titles[mode]}</h2>
      <p className="auth-subtitle">
        {mode === "login"
          ? "Đăng nhập để mở những điều nhỏ dành cho nhau."
          : mode === "register"
            ? "Mỗi người một tài khoản. Cùng nhau một khoảng riêng."
            : mode === "verify"
              ? "Xác nhận email trước khi gửi và nhận lời mời."
              : "Nhập thông tin bên dưới để tiếp tục."}
      </p>
      {params.get("error") === "callback" && (
        <Notice text="Liên kết không còn hợp lệ hoặc đã mở ở trình duyệt khác. Cậu yêu cầu liên kết mới nhé." />
      )}
      <form onSubmit={submit} className="form-stack">
        {mode !== "reset" && (
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email của cậu"
              required
              maxLength={254}
            />
          </label>
        )}
        {["login", "register", "reset"].includes(mode) && (
          <label>
            Mật khẩu
            <div className="password-field">
              <input
                type={show ? "text" : "password"}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={mode === "login" ? undefined : 8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === "login" ? "Mật khẩu của cậu" : "Ít nhất 8 ký tự"
                }
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setShow(!show)}
                aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
        )}
        {["register", "reset"].includes(mode) && (
          <label>
            Nhập lại mật khẩu
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
              minLength={8}
            />
          </label>
        )}
        {mode === "login" && (
          <Link href="/forgot-password" className="forgot-link">
            Quên mật khẩu?
          </Link>
        )}
        <Notice error={error} text={message} />
        <Button busy={busy} disabled={!ready} type="submit">
          {mode === "login"
            ? "Vào khoảng riêng"
            : mode === "register"
              ? "Tạo tài khoản"
              : mode === "forgot"
                ? "Gửi liên kết đặt lại"
                : mode === "reset"
                  ? "Lưu mật khẩu mới"
                  : "Gửi lại email xác nhận"}
          <ArrowRight size={18} />
        </Button>
      </form>
      {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true" &&
        ["login", "register"].includes(mode) && (
          <>
            <div className="divider">
              <span>hoặc</span>
            </div>
            <Button
              className="button-secondary full"
              busy={busy}
              onClick={google}
            >
              Tiếp tục với Google
            </Button>
          </>
        )}
      <p className="auth-switch">
        {mode === "login" ? (
          <>
            Chưa có tài khoản?{" "}
            <Link href={authLink("/register")}>Bắt đầu cùng nhau</Link>
          </>
        ) : (
          <>
            Đã có tài khoản? <Link href={authLink("/login")}>Đăng nhập</Link>
          </>
        )}
      </p>
      {mode === "login" && (
        <Link className="subtle-link" href={authLink("/verify-email")}>
          Cần gửi lại email xác nhận?
        </Link>
      )}
    </section>
  );
}
