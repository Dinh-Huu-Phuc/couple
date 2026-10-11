"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@couple/api";
import { Check, Heart, MessageCircle, Clock, ImagePlus } from "lucide-react";
import {
  categories,
  dateLabel,
  drawStatusLabels,
  money,
  discussionInputSchema,
  deferTimeSchema,
  type Draw,
} from "@couple/domain";
import { useApp } from "@/components/app-shell";
import { Button, Notice } from "@/components/ui";
import { useAction } from "@/lib/use-action";
import { MemoryEditor } from "@/features/memories/memory-editor";
import { LetterView } from "@/features/wishes/letter-view";
export function DrawCard({ draw }: { draw: Draw }) {
  const { api, userId, context, letterActivity } = useApp();
  const cache = useQueryClient();
  const activity = letterActivity.find((row) => row.draw_id === draw.id);
  const unread = !!activity && activity.version > activity.seen_version;
  const [viewedVersion, setViewedVersion] = useState(0);
  const [seenError, setSeenError] = useState<unknown>();
  const reveal = !unread || viewedVersion >= (activity?.version ?? 0);
  async function viewActivity() {
    if (!activity) return;
    if (
      activity.kind === "reply" &&
      (!draw.discussion_at ||
        !activity.discussion_at ||
        new Date(draw.discussion_at).getTime() !==
          new Date(activity.discussion_at).getTime())
    ) {
      await cache.invalidateQueries({
        queryKey: queryKeys.draws(userId, draw.couple_id),
      });
      return;
    }
    setViewedVersion(activity.version);
    setSeenError(undefined);
    try {
      await api.seeLetterActivity(draw.id, activity.version);
      await cache.invalidateQueries({ queryKey: [userId, "letter-activity"] });
    } catch (error) {
      setSeenError(error);
    }
  }
  const action = useAction();
  const [memory, setMemory] = useState(false);
  const [response, setResponse] = useState<"discuss" | "deferred" | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const mine = draw.drawn_by === userId;
  return (
    <article className={`draw-card ${mine ? "my-draw" : ""}`}>
      <div className="card-top">
        <span className="eyebrow">{mine ? "CẬU ĐÃ MỞ" : "NGƯỜI ẤY ĐÃ MỞ"}</span>
        <span className={`badge status-${draw.status}`}>
          {drawStatusLabels[draw.status]}
        </span>
      </div>
      <span className="category">{categories[draw.snapshot.category]}</span>
      <h2>{draw.snapshot.title}</h2>
      {!mine && (
        <p className="field-note">
          💌 Người ấy đã mở ·{" "}
          {dateLabel(draw.drawn_at, context.profile.timezone)}
        </p>
      )}
      {unread && (
        <div className="button-row">
          <span className="badge">
            {activity.kind === "reply" ? "Phản hồi mới" : "Người ấy vừa mở thư"}
          </span>
          <Button
            className="button-secondary"
            onClick={() => void viewActivity()}
          >
            {activity.kind === "reply" ? "Xem phản hồi" : "Xem thư"}
          </Button>
        </div>
      )}
      <Notice error={seenError} retry={() => void viewActivity()} />
      <LetterView snapshot={draw.snapshot} />
      <dl className="draw-meta-grid">
        <div>
          <dt>Ngân sách</dt>
          <dd>{money(draw.snapshot.budgetVnd)}</dd>
        </div>
        <div>
          <dt>Mở lúc</dt>
          <dd>
            <time>{dateLabel(draw.drawn_at, context.profile.timezone)}</time>
          </dd>
        </div>
        {draw.completed_at && (
          <div>
            <dt>Hoàn thành</dt>
            <dd>
              <time>
                {dateLabel(draw.completed_at, context.profile.timezone)}
              </time>
            </dd>
          </div>
        )}
      </dl>
      {draw.discussion_message && reveal && (
        <blockquote className="draw-reply">
          <header>
            <MessageCircle size={16} aria-hidden="true" />
            <strong>
              {mine
                ? "Lời nhắn của cậu"
                : `${context.couple?.partner.displayName ?? "Người ấy"} nhắn`}
            </strong>
          </header>
          <p className="preserve-lines">{draw.discussion_message}</p>
          {draw.discussion_at && (
            <time dateTime={draw.discussion_at}>
              {dateLabel(draw.discussion_at, context.profile.timezone)}
            </time>
          )}
        </blockquote>
      )}
      {draw.deferred_until && (
        <div className="draw-schedule">
          <Clock size={17} aria-hidden="true" />
          <div>
            <strong>Để dịp khác</strong>
            <p>
              Hẹn lại:{" "}
              <time dateTime={draw.deferred_until}>
                {dateLabel(draw.deferred_until, context.profile.timezone)}
              </time>
            </p>
            <span className="field-note">
              Mong muốn có thể được bốc lại từ thời điểm này nếu vẫn còn phù
              hợp.
            </span>
          </div>
        </div>
      )}
      <Notice error={action.error} />
      {mine && !response && (
        <div className="button-row draw-actions">
          {["opened", "discuss"].includes(draw.status) && (
            <Button
              busy={action.busy}
              onClick={() =>
                void action.run(() => api.respondDraw(draw.id, "accepted"))
              }
            >
              <Heart size={16} />
              Để mình lo
            </Button>
          )}
          {["opened", "discuss"].includes(draw.status) && (
            <Button
              className="button-secondary"
              busy={action.busy}
              onClick={() => setResponse("discuss")}
            >
              <MessageCircle size={16} />
              {draw.discussion_message ? "Sửa lời nhắn" : "Cùng bàn nhé"}
            </Button>
          )}
          {["opened", "discuss", "accepted"].includes(draw.status) && (
            <Button
              className="button-ghost"
              busy={action.busy}
              onClick={() => setResponse("deferred")}
            >
              <Clock size={16} />
              Để dịp khác
            </Button>
          )}
          {draw.status === "accepted" && (
            <Button
              busy={action.busy}
              onClick={() =>
                void action.run(
                  () => api.complete(draw.id),
                  async () => {
                    setCelebrating(true);
                    if (
                      !window.matchMedia("(prefers-reduced-motion: reduce)")
                        .matches
                    )
                      await new Promise((resolve) =>
                        window.setTimeout(resolve, 700),
                      );
                    setCelebrating(false);
                  },
                )
              }
            >
              <Check size={16} />
              Đã hoàn thành
            </Button>
          )}
          {draw.status === "completed" && (
            <Button
              className="button-secondary"
              onClick={() => setMemory(true)}
            >
              <ImagePlus size={16} />
              Viết / sửa kỷ niệm
            </Button>
          )}
        </div>
      )}
      {mine && response && (
        <ResponseForm
          key={response}
          mode={response}
          initialMessage={draw.discussion_message}
          busy={action.busy}
          close={() => setResponse(null)}
          submit={(details) =>
            action.run(
              () => api.respondDraw(draw.id, response, details),
              () => setResponse(null),
            )
          }
        />
      )}
      {memory && <MemoryEditor draw={draw} close={() => setMemory(false)} />}
      {celebrating && (
        <div className="completion-hearts" aria-hidden="true">
          <Heart />
          <Heart />
          <Heart />
        </div>
      )}
    </article>
  );
}

function ResponseForm({
  mode,
  initialMessage,
  busy,
  close,
  submit,
}: {
  mode: "discuss" | "deferred";
  initialMessage: string;
  busy: boolean;
  close: () => void;
  submit: (details: {
    message?: string;
    deferredUntil?: string;
  }) => Promise<unknown>;
}) {
  const [message, setMessage] = useState(initialMessage);
  const [when, setWhen] = useState("");
  const [validation, setValidation] = useState("");
  const [min] = useState(() => {
    const nextMinute = new Date(Date.now() + 60_000);
    return new Date(
      nextMinute.getTime() - nextMinute.getTimezoneOffset() * 60_000,
    )
      .toISOString()
      .slice(0, 16);
  });
  return (
    <form
      className="draw-response-form form-stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setValidation("");
        if (mode === "discuss") {
          const parsed = discussionInputSchema.safeParse(message);
          if (!parsed.success) {
            setValidation(parsed.error.issues[0].message);
            return;
          }
          await submit({ message: parsed.data });
        } else {
          const timestamp = when ? new Date(when).getTime() : NaN;
          const parsed = deferTimeSchema.safeParse(
            Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "",
          );
          if (!parsed.success) {
            setValidation(
              "Cậu cần chọn ngày giờ trong tương lai trước khi xác nhận nhé.",
            );
            return;
          }
          await submit({ deferredUntil: parsed.data });
        }
      }}
    >
      {mode === "discuss" ? (
        <>
          <label>
            Lời nhắn gửi người ấy
            <textarea
              autoFocus
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={1000}
              required
              disabled={busy}
              placeholder="Cậu muốn cùng người ấy bàn điều gì?"
            />
          </label>
          <p className="field-note">
            {message.length}/1.000 ký tự · Người ấy đọc được lời nhắn trên lá
            thư ở mục Đã mở.
          </p>
        </>
      ) : (
        <>
          <label>
            Hẹn lại vào ngày giờ
            <input
              autoFocus
              type="datetime-local"
              value={when}
              min={min}
              onChange={(event) => setWhen(event.target.value)}
              required
              disabled={busy}
            />
          </label>
          <p className="field-note">
            Bắt buộc chọn thời điểm trong tương lai, theo giờ trên thiết bị của
            cậu. Sau khi xác nhận, lượt này được đóng và mong muốn có thể bốc
            lại từ lúc đã hẹn.
          </p>
        </>
      )}
      <Notice text={validation} />
      <div className="button-row">
        <Button
          type="button"
          className="button-secondary"
          disabled={busy}
          onClick={close}
        >
          Quay lại
        </Button>
        <Button
          type="submit"
          busy={busy}
          disabled={mode === "discuss" ? !message.trim() : !when}
        >
          {mode === "discuss" ? "Gửi lời nhắn" : "Xác nhận để dịp khác"}
        </Button>
      </div>
    </form>
  );
}
