"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { dateLabel, feedbackStatusLabels, feedbackTypeLabels } from "@couple/domain";
import { Button, Loading, Notice } from "@/components/ui";
import { adminRequest } from "./client";
import { adminFeedbackSchema } from "./operations-data";
import styles from "./dashboard.module.css";

type Status = z.infer<typeof adminFeedbackSchema>["status"];

export function AdminFeedback() {
  const cache = useQueryClient();
  const [filter, setFilter] = useState<Status | "all">("all");
  const [editing, setEditing] = useState<string>();
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState<Status>("reviewing");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>();
  const query = useQuery({
    queryKey: ["admin", "feedback", filter],
    queryFn: () =>
      adminRequest(
        `feedback${filter === "all" ? "" : `?status=${filter}`}`,
        z.array(adminFeedbackSchema),
      ),
    refetchInterval: 30_000,
  });
  async function save(id: string) {
    setSaving(true);
    setError(undefined);
    try {
      await adminRequest("feedback", adminFeedbackSchema, { id, status, reply });
      setEditing(undefined);
      setReply("");
      await cache.invalidateQueries({ queryKey: ["admin", "feedback"] });
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className={styles.feedback} aria-labelledby="feedback-heading">
      <div className={styles.sectionTop}>
        <div>
          <h2 id="feedback-heading">Hỗ trợ & góp ý</h2>
          <p className="muted">Đọc lời nhắn, phản hồi trong ứng dụng và cập nhật tiến độ.</p>
        </div>
        <label>
          Trạng thái
          <select value={filter} onChange={(event) => setFilter(event.target.value as Status | "all")}>
            <option value="all">Tất cả</option>
            {Object.entries(feedbackStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      <Notice error={query.error ?? error} retry={() => void query.refetch()} />
      {query.isPending ? (
        <Loading text="Đang đọc góp ý…" />
      ) : (
        <div className={styles.records}>
          {!query.data?.length && <p className="muted">Chưa có lời nhắn phù hợp.</p>}
          {query.data?.map((row) => (
            <article key={row.id} className={`panel ${styles.feedbackRecord}`}>
              <div className={styles.feedbackMeta}>
                <span className="eyebrow">{feedbackTypeLabels[row.type]}</span>
                <span className="badge">{feedbackStatusLabels[row.status]}</span>
              </div>
              <h3>{row.title}</h3>
              <p className="preserve-lines">{row.body}</p>
              <p className="muted">Email phản hồi: {row.reply_email}</p>
              <small>{dateLabel(row.created_at)} · {row.id}</small>
              {row.admin_reply && (
                <blockquote><strong>Phản hồi hiện tại</strong><p className="preserve-lines">{row.admin_reply}</p></blockquote>
              )}
              {editing === row.id ? (
                <div className="form-stack">
                  <label>Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value as Status)}>{Object.entries(feedbackStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label>Phản hồi<textarea rows={5} maxLength={4000} value={reply} onChange={(event) => setReply(event.target.value)} /></label>
                  <div className="button-row"><Button className="button-secondary" disabled={saving} onClick={() => setEditing(undefined)}>Hủy</Button><Button busy={saving} onClick={() => void save(row.id)}>Lưu phản hồi</Button></div>
                </div>
              ) : (
                <Button className="button-secondary" onClick={() => { setEditing(row.id); setStatus(row.status === "new" ? "reviewing" : row.status); setReply(row.admin_reply ?? ""); }}>Xử lý lời nhắn</Button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
