"use client";
import { useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { dateLabel } from "@couple/domain";
import { adminRequest } from "./client";
import { Button, Loading, Notice, PageHeading } from "@/components/ui";
import styles from "./dashboard.module.css";
import { deletionRowSchema, operationsSchema } from "./operations-data";
import { AdminAccounts } from "./accounts";
import { AdminFeedback } from "./feedback";

const statusLabels = {
  pending: "Đang xử lý ảnh",
  files_ready: "Đang xử lý tài khoản",
  completed: "Tài khoản đã được xóa",
};
export function AdminDashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<unknown>();
  async function logout() {
    setLoggingOut(true);
    setLogoutError(undefined);
    try {
      await adminRequest("logout", z.object({}), {});
      await queryClient.cancelQueries({ queryKey: ["admin"] });
      queryClient.removeQueries({ queryKey: ["admin"] });
      router.refresh();
    } catch (error) {
      setLogoutError(error);
    } finally {
      setLoggingOut(false);
    }
  }
  const operations = useQuery({
    queryKey: ["admin", "operations"],
    queryFn: () => adminRequest("operations", operationsSchema),
    refetchInterval: 30_000,
  });
  const rows = useInfiniteQuery({
    queryKey: ["admin", "deletion-requests"],
    initialPageParam: undefined as { at: string; id: string } | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) {
        params.set("before", pageParam.at);
        params.set("beforeId", pageParam.id);
      }
      return adminRequest(`list?${params}`, z.array(deletionRowSchema));
    },
    getNextPageParam: (last) =>
      last.length === 20
        ? { at: last.at(-1)!.created_at, id: last.at(-1)!.id }
        : undefined,
    refetchInterval: 30_000,
  });
  const all = [
    ...new Map(
      (rows.data?.pages.flat() ?? []).map((row) => [row.id, row]),
    ).values(),
  ];
  return (
    <main className={styles.shell}>
      <header className={styles.top}>
        <Link className="wordmark" href="/">
          COUPLE · ADMIN
        </Link>
        <Button
          className="button-secondary"
          busy={loggingOut}
          onClick={() => void logout()}
        >
          Đăng xuất admin
        </Button>
      </header>
      <PageHeading
        eyebrow="KHU VỰC QUẢN TRỊ RIÊNG"
        title="Vận hành COUPLE."
        description="Theo dõi hoạt động và tiến độ xử lý yêu cầu xóa tài khoản."
      />
      <Notice error={logoutError} />
      <Notice
        error={operations.error}
        retry={() => void operations.refetch()}
      />
      {operations.isPending ? (
        <Loading text="Đang kiểm tra vận hành…" />
      ) : (
        operations.data && (
          <div className={styles.stats}>
            {[
              [operations.data.accounts, "Tài khoản hiện có"],
              [operations.data.activeCouples, "Cặp đang kết nối"],
              [operations.data.pending, "Yêu cầu chưa hoàn tất"],
              [operations.data.failed, "Yêu cầu cần thử lại"],
              [
                operations.data.legacyRequests,
                "Bản lưu cũ đang bị chặn truy cập",
              ],
              [operations.data.legacyObjects, "Ảnh trong kho lưu cũ cần dọn"],
            ].map(([count, label]) => (
              <div key={label}>
                <strong>{count}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )
      )}
      <AdminAccounts />
      <AdminFeedback />
      <section aria-labelledby="deletion-heading">
        <h2 id="deletion-heading">Yêu cầu xóa tài khoản</h2>
        <p className="muted">
          Mã yêu cầu giúp đối chiếu tiến độ xử lý. Thông tin tài khoản và nội
          dung riêng tư không được hiển thị tại đây.
        </p>
        <Button
          className="button-secondary"
          busy={rows.isFetching || operations.isFetching}
          onClick={() => {
            void rows.refetch();
            void operations.refetch();
          }}
        >
          Làm mới
        </Button>
        <Notice error={rows.error} retry={() => void rows.refetch()} />
        {rows.isPending ? (
          <Loading text="Đang đọc yêu cầu xóa…" />
        ) : (
          <div className={styles.records}>
            {!all.length && (
              <p className="muted">Chưa có yêu cầu xóa tài khoản.</p>
            )}
            {all.map((row) => (
              <article key={row.id} className={`panel ${styles.record}`}>
                <div>
                  <span className="eyebrow">
                    {row.workflow === "legacy" ? "LUỒNG CŨ · " : ""}
                    {statusLabels[row.status]}
                  </span>
                  <p>
                    Mã yêu cầu: <code>{row.id}</code>
                  </p>
                  <p className="muted">
                    Tiếp nhận: {dateLabel(row.created_at)}
                  </p>
                  {row.completed_at && (
                    <p className="muted">
                      Xóa tài khoản: {dateLabel(row.completed_at)}
                    </p>
                  )}
                  {row.last_error && (
                    <p role="status">
                      Cần thử lại bước{" "}
                      {
                        {
                          storage: "xóa ảnh",
                          auth: "xóa đăng nhập",
                          database: "xử lý cơ sở dữ liệu",
                        }[row.last_error]
                      }
                      .
                    </p>
                  )}
                  {row.audit_expires_at && (
                    <p className="muted">
                      Hết thời hạn lưu nhật ký:{" "}
                      {dateLabel(row.audit_expires_at)}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        {rows.hasNextPage && (
          <Button
            className="button-secondary"
            busy={rows.isFetchingNextPage}
            onClick={() => void rows.fetchNextPage()}
          >
            Xem yêu cầu cũ hơn
          </Button>
        )}
      </section>
    </main>
  );
}
