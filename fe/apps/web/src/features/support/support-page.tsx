"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, LifeBuoy, Send } from "lucide-react";
import {
  dateLabel,
  feedbackInputSchema,
  feedbackStatusLabels,
  feedbackTypeLabels,
  type FeedbackInput,
} from "@couple/domain";
import { queryKeys } from "@couple/api";
import { useApp } from "@/components/app-shell";
import { Button, Loading, Notice, PageHeading } from "@/components/ui";
import { useAction } from "@/lib/use-action";

const faqs = [
  ["Vì sao mình chưa nhận được email?", "Cậu kiểm tra mục Spam/Thư rác, chờ một phút rồi yêu cầu gửi lại. Nếu vẫn chưa có, hãy gửi phiếu hỗ trợ bên dưới."],
  ["Người ấy có đọc được góp ý của mình không?", "Không. Phiếu hỗ trợ chỉ hiển thị cho tài khoản đã gửi và khu vực quản trị vận hành."],
  ["Xóa tài khoản có xóa dữ liệu chung không?", "Có. Kỷ niệm chung liên quan tới tài khoản bị xóa cũng được xóa theo quy định đã hiển thị khi đăng ký."],
];

export function SupportPage() {
  const { userId, email, api, context } = useApp();
  const action = useAction();
  const [input, setInput] = useState<FeedbackInput>({ type: "support", title: "", body: "", replyEmail: email });
  const [validation, setValidation] = useState("");
  const [reference, setReference] = useState("");
  const feedback = useQuery({ queryKey: queryKeys.feedback(userId), queryFn: () => api.feedback() });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = feedbackInputSchema.safeParse(input);
    if (!parsed.success) {
      setValidation(parsed.error.issues[0]?.message ?? "Cậu kiểm tra lại thông tin nhé.");
      return;
    }
    setValidation("");
    await action.run(
      () => api.createFeedback(parsed.data, action.keys.get("feedback", parsed.data)),
      (result) => {
        action.keys.clear("feedback", parsed.data);
        setReference(result.id);
        setInput((current) => ({ ...current, title: "", body: "" }));
        action.setMessage("COUPLE đã nhận được lời nhắn của cậu.");
      },
    );
  }
  return (
    <>
      <PageHeading eyebrow="COUPLE LUÔN Ở ĐÂY" title="Hỗ trợ & góp ý." description="Gửi một lời nhắn khi cậu gặp lỗi, cần hỗ trợ hoặc có ý tưởng mới." />
      <section className="support-layout">
        <div className="support-main">
          <section className="panel">
            <div className="panel-heading"><LifeBuoy size={22} /><div><h2>Gửi lời nhắn</h2><p className="muted">Không tự động đính kèm thư, ảnh hay dữ liệu riêng tư của hai mình.</p></div></div>
            <form className="form-stack" onSubmit={(event) => void submit(event)}>
              <label>Loại yêu cầu<select value={input.type} onChange={(e) => setInput({ ...input, type: e.target.value as FeedbackInput["type"] })}>
                {Object.entries(feedbackTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
              <label>Tiêu đề<input value={input.title} maxLength={120} required onChange={(e) => setInput({ ...input, title: e.target.value })} placeholder="Tóm tắt điều cậu muốn nhắn" /></label>
              <label>Nội dung<textarea rows={6} value={input.body} maxLength={4000} required onChange={(e) => setInput({ ...input, body: e.target.value })} placeholder="Mô tả điều đã xảy ra hoặc ý tưởng của cậu…" /></label>
              <label>Email nhận phản hồi<input type="email" value={input.replyEmail} maxLength={254} required onChange={(e) => setInput({ ...input, replyEmail: e.target.value })} /></label>
              {validation && <Notice text={validation} />}
              <Notice error={action.error} text={action.message} />
              {reference && <div className="success-reference" role="status"><CheckCircle2 size={20} /><span>Mã tham chiếu: <code>{reference}</code></span></div>}
              <Button type="submit" busy={action.busy}><Send size={17} />Gửi góp ý</Button>
            </form>
          </section>
          <section className="panel" aria-labelledby="feedback-history"><h2 id="feedback-history">Lời nhắn đã gửi</h2>
            <Notice error={feedback.error} retry={() => void feedback.refetch()} />
            {feedback.isPending ? <Loading text="Đang đọc lời nhắn…" /> : !feedback.data?.length ? <p className="muted">Cậu chưa gửi lời nhắn nào.</p> : <div className="feedback-list">{feedback.data.map((row) => <article key={row.id} className="feedback-card">
              <div className="card-top"><span className="eyebrow">{feedbackTypeLabels[row.type]}</span><span className={`badge feedback-${row.status}`}>{feedbackStatusLabels[row.status]}</span></div>
              <h3>{row.title}</h3><p className="preserve-lines">{row.body}</p>
              {row.admin_reply && <blockquote><strong>Phản hồi từ COUPLE</strong><p className="preserve-lines">{row.admin_reply}</p></blockquote>}
              <small>{dateLabel(row.created_at, context.profile.timezone)} · {row.id}</small>
            </article>)}</div>}
          </section>
        </div>
        <aside className="panel faq-panel"><h2>Câu hỏi thường gặp</h2>{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</aside>
      </section>
    </>
  );
}
