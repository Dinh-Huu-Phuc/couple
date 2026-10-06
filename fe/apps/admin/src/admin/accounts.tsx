"use client";
import { useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import { dateLabel } from "@couple/domain";
import { Button, Dialog, Loading, Notice } from "@/components/ui";
import { adminRequest } from "./client";
import { activityRowSchema, policySchema } from "./operations-data";
import styles from "./dashboard.module.css";
import { ModerationControls } from "./moderation-controls";

type Account = z.infer<typeof activityRowSchema>;
export function AdminAccounts() {
  const cache = useQueryClient();
  const policy = useQuery({
    queryKey: ["admin", "inactivity-policy"],
    queryFn: () => adminRequest("inactivity-policy", policySchema),
  });
  const accounts = useInfiniteQuery({
    queryKey: ["admin", "accounts"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      adminRequest(
        `accounts${pageParam ? `?after=${pageParam}` : ""}`,
        z.array(activityRowSchema),
      ),
    getNextPageParam: (last) =>
      last.length === 50 ? last.at(-1)!.id : undefined,
    refetchInterval: 60_000,
  });
  const [days, setDays] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>();
  const [selected, setSelected] = useState<Account | null>(null);
  const [phrase, setPhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>();
  return (
    <section className={styles.accounts} aria-labelledby="accounts-heading">
      <h2 id="accounts-heading">Tài khoản và thời gian không hoạt động</h2>
      <p className="muted">
        Theo lần sử dụng app gần nhất được ghi nhận. Đây không phải trạng thái
        online chính xác. Hệ thống kiểm tra tự động mỗi giờ; chỉ xoá tài khoản
        đã chấp nhận mốc hiện tại.
      </p>
      <Notice error={policy.error} retry={() => void policy.refetch()} />
      {policy.data && (
        <form
          className="panel form-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            if (saving) return;
            setSaving(true);
            setError(undefined);
            try {
              const next = await adminRequest(
                "inactivity-policy",
                policySchema,
                {
                  days: Number(days || policy.data!.days),
                  version: policy.data!.version,
                },
              );
              cache.setQueryData(["admin", "inactivity-policy"], next);
              setDays("");
              await accounts.refetch();
            } catch (e) {
              setError(e);
              await policy.refetch();
            } finally {
              setSaving(false);
            }
          }}
        >
          <label>
            Số ngày không hoạt động trước khi tự động xoá
            <input
              type="number"
              min={1}
              max={3650}
              step={1}
              required
              value={days || String(policy.data.days)}
              onChange={(e) => setDays(e.target.value)}
            />
          </label>
          <p className="muted">
            Hiện tại: {policy.data.days} ngày · Phiên bản {policy.data.version}.
            Đổi mốc sẽ yêu cầu người dùng chấp nhận lại. Không áp dụng hồi tố
            mốc mới.
          </p>
          <Notice error={error} />
          <Button type="submit" busy={saving}>
            Lưu số ngày
          </Button>
        </form>
      )}
      <Button
        className="button-secondary"
        busy={accounts.isFetching}
        onClick={() => void accounts.refetch()}
      >
        Làm mới tài khoản
      </Button>
      <Notice error={accounts.error} retry={() => void accounts.refetch()} />
      {accounts.isPending ? (
        <Loading text="Đang đọc hoạt động tài khoản…" />
      ) : (
        <div className={styles.records}>
          {!accounts.data?.pages.flat().length && <p>Chưa có tài khoản.</p>}
          {accounts.data?.pages.flat().map((account) => (
            <article className={`panel ${styles.record}`} key={account.id}>
              <div>
                <strong>{account.email ?? "Tài khoản không có email"}</strong>
                <p className="muted">
                  Tạo ngày: {dateLabel(account.created_at)}
                </p>
                <p>
                  {account.activity_observed
                    ? `Hoạt động gần nhất: ${dateLabel(account.last_seen_at)} · Không hoạt động ${account.inactive_days} ngày`
                    : `Chưa ghi nhận lần sử dụng · Bắt đầu theo dõi: ${dateLabel(account.last_seen_at)}`}
                </p>
                <p className="muted">
                  {account.deletion_pending
                    ? "Đang xử lý xoá"
                    : !account.accepted
                      ? "Chưa chấp nhận mốc hiện tại · Không tự động xoá"
                      : account.eligible
                        ? "Đã tới hạn · Đang chờ đợt dọn tự động"
                        : `Có thể tới hạn từ: ${dateLabel(account.eligible_at)}`}
                </p>
                {account.banned && <p className="muted">Đã ban · {account.ban_reason} · {account.banned_at ? dateLabel(account.banned_at) : ""}</p>}
              </div>
              <ModerationControls id={account.id} email={account.email} banned={account.banned} pending={account.deletion_pending} />
              <Button
                className="button-danger"
                disabled={!account.eligible || account.deletion_pending}
                onClick={() => {
                  setSelected(account);
                  setPhrase("");
                  setDeleteError(undefined);
                }}
              >
                Xoá tài khoản tới hạn
              </Button>
            </article>
          ))}
        </div>
      )}
      {accounts.hasNextPage && (
        <Button
          className="button-secondary"
          busy={accounts.isFetchingNextPage}
          onClick={() => void accounts.fetchNextPage()}
        >
          Xem thêm tài khoản
        </Button>
      )}
      {selected && (
        <Dialog
          title="Xoá tài khoản không hoạt động?"
          close={() => {
            if (!deleting) setSelected(null);
          }}
        >
          <p>
            {selected.email} · Không hoạt động {selected.inactive_days} ngày.
          </p>
          <p>
            Thao tác xoá vĩnh viễn tài khoản, nội dung riêng và kỷ niệm chung
            liên quan, kể cả kỷ niệm do người ấy tạo. Mong muốn riêng của người
            ấy được giữ. Không tạo bản sao nội dung trong trang quản trị.
          </p>
          <label>
            Nhập “XOÁ TÀI KHOẢN” để xác nhận
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
            />
          </label>
          <Notice error={deleteError} />
          <div className="button-row">
            <Button
              className="button-secondary"
              disabled={deleting}
              onClick={() => setSelected(null)}
            >
              Huỷ
            </Button>
            <Button
              className="button-danger"
              busy={deleting}
              disabled={phrase !== "XOÁ TÀI KHOẢN"}
              onClick={async () => {
                if (deleting) return;
                setDeleting(true);
                setDeleteError(undefined);
                try {
                  await adminRequest("delete-inactive", z.object({}), {
                    id: selected.id,
                    confirmation: phrase,
                  });
                  setSelected(null);
                  await cache.invalidateQueries({ queryKey: ["admin"] });
                } catch (e) {
                  setDeleteError(e);
                  await accounts.refetch();
                } finally {
                  setDeleting(false);
                }
              }}
            >
              Xác nhận xoá
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
