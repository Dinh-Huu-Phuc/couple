"use client";
import { useState } from "react";
import { Plus, Pencil, Pause, Play, Archive, Mail } from "lucide-react";
import {
  categories,
  dateLabel,
  money,
  wishStatusLabels,
  type Wish,
} from "@couple/domain";
import { useApp } from "@/components/app-shell";
import {
  Button,
  Dialog,
  Empty,
  Loading,
  Notice,
  PageHeading,
} from "@/components/ui";
import { useAction } from "@/lib/use-action";
import { useWishes } from "@/lib/use-list";
import { WishEditor } from "./wish-editor";
export function WishesPage() {
  const { api, context } = useApp();
  const action = useAction();
  const [status, setStatus] = useState("all");
  const [includePrevious, setIncludePrevious] = useState(false);
  const query = useWishes(status, includePrevious);
  const [editor, setEditor] = useState<Wish | "new" | null>(null);
  const [withdraw, setWithdraw] = useState<Wish>();
  const wishes = query.data?.pages.flat() ?? [];
  return (
    <>
      <PageHeading
        eyebrow="NHỮNG ĐIỀU CẬU MUỐN NÓI"
        title="Hộp của tớ."
        description={
          context.couple
            ? "Cất những mong muốn nhỏ. Để người ấy có dịp hiểu cậu hơn."
            : "Mong muốn cậu đã viết vẫn ở đây, trong chế độ chỉ đọc."
        }
        action={
          context.couple && (
            <Button onClick={() => setEditor("new")}>
              <Plus size={17} />
              Viết mong muốn
            </Button>
          )
        }
      />
      <div className="chips" aria-label="Lọc mong muốn">
        <button
          className={status === "all" ? "selected" : ""}
          onClick={() => setStatus("all")}
        >
          Tất cả
        </button>
        {Object.entries(wishStatusLabels).map(([key, label]) => (
          <button
            key={key}
            className={status === key ? "selected" : ""}
            onClick={() => setStatus(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {context.couple && (
        <label className="previous-wishes">
          <input
            type="checkbox"
            checked={includePrevious}
            onChange={(e) => setIncludePrevious(e.target.checked)}
          />
          Hiện cả mong muốn của tớ từ kết nối trước
        </label>
      )}
      <Notice error={action.error} text={action.message} />
      <Notice error={query.error} retry={() => void query.refetch()} />
      {query.isPending ? (
        <Loading />
      ) : !wishes.length ? (
        <Empty
          title="Hộp vẫn đang đợi lá thư đầu tiên"
          text="Một món ăn, một buổi hẹn hay đơn giản là một cái ôm."
        />
      ) : (
        <div className="wish-grid">
          {wishes.map((wish) => (
            <article key={wish.id} className="wish-card">
              <div className="card-top">
                <span className={`category category-${wish.category}`}>
                  <Mail size={14} />
                  {categories[wish.category]}
                </span>
                <span className={`badge status-${wish.status}`}>
                  {wishStatusLabels[wish.status]}
                </span>
              </div>
              <h2>{wish.title}</h2>
              {context.couple?.id !== wish.couple_id && (
                <p className="muted">Kết nối đã kết thúc · Chỉ đọc</p>
              )}
              <p className="preserve-lines">
                {wish.description || "Một điều nhỏ, dành cho nhau."}
              </p>
              <div className="wish-meta">
                <span>{money(wish.budget_vnd)}</span>
                <time>
                  {dateLabel(wish.created_at, context.profile.timezone)}
                </time>
                {wish.available_from && (
                  <span>
                    Từ{" "}
                    {dateLabel(wish.available_from, context.profile.timezone)}
                  </span>
                )}
                {wish.expires_at && (
                  <span>
                    Đến {dateLabel(wish.expires_at, context.profile.timezone)}
                  </span>
                )}
              </div>
              {context.couple?.id === wish.couple_id &&
                ["active", "paused"].includes(wish.status) && (
                  <div className="card-actions">
                    <button onClick={() => setEditor(wish)}>
                      <Pencil size={15} />
                      Sửa
                    </button>
                    <button
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(() =>
                          api.statusWish(
                            wish.id,
                            wish.version,
                            wish.status === "active" ? "paused" : "active",
                          ),
                        )
                      }
                    >
                      {wish.status === "active" ? (
                        <Pause size={15} />
                      ) : (
                        <Play size={15} />
                      )}
                      {wish.status === "active" ? "Tạm ẩn" : "Mở lại"}
                    </button>
                    <button
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(() =>
                          api.statusWish(wish.id, wish.version, "archived"),
                        )
                      }
                    >
                      <Archive size={15} />
                      Lưu trữ
                    </button>
                    <button onClick={() => setWithdraw(wish)}>
                      Rút mong muốn
                    </button>
                  </div>
                )}
            </article>
          ))}
        </div>
      )}
      {query.hasNextPage && (
        <Button
          className="button-secondary load-more"
          busy={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Xem thêm lá thư
        </Button>
      )}
      {editor && (
        <WishEditor
          wish={editor === "new" ? undefined : editor}
          close={() => setEditor(null)}
        />
      )}{" "}
      {withdraw && (
        <Dialog
          title="Rút mong muốn này?"
          close={() => {
            if (!action.busy) setWithdraw(undefined);
          }}
        >
          <p>
            “{withdraw.title}” sẽ được lưu trữ. Nếu đang có lượt bốc chưa xử lý,
            lượt đó sẽ được đóng. Nội dung thẻ đã mở vẫn nằm trong lịch sử khi
            hai người còn kết nối.
          </p>
          <Notice error={action.error} />
          <div className="button-row">
            <Button
              className="button-secondary"
              disabled={action.busy}
              onClick={() => setWithdraw(undefined)}
            >
              Giữ lại
            </Button>
            <Button
              busy={action.busy}
              onClick={() =>
                void action.run(
                  () => api.withdrawWish(withdraw.id, withdraw.version),
                  () => setWithdraw(undefined),
                )
              }
            >
              Rút mong muốn
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
