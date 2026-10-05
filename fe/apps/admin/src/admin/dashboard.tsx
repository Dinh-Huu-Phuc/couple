"use client";
import { useEffect, useState } from "react";
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

const rowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["account", "connection"]),
  source_user_id: z.uuid(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  status: z.enum(["pending", "files_ready", "completed"]),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  photo_count: z.number(),
});
const detailSchema = rowSchema.omit({ photo_count: true }).extend({
  payload: z.record(z.string(), z.unknown()),
  files: z.array(
    z.object({ bucket: z.string(), name: z.string(), archiveKey: z.string() }),
  ),
});
const statusLabels = {
  pending: "Đang lưu ảnh",
  files_ready: "Đang xoá tài khoản",
  completed: "Đã hoàn tất",
};
function ArchivePhoto({
  id,
  index,
  name,
}: {
  id: string;
  index: number;
  name: string;
}) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    let alive = true;
    let objectUrl: string | undefined;
    void fetch(`/api/photo?id=${id}&index=${index}`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.status === 401) window.location.replace("/");
        if (!response.ok) throw new Error("Không thể tải ảnh đã lưu.");
        return response.blob();
      })
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((failure) => {
        if (alive) setError(failure);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, index]);
  return (
    <figure className={styles.photo}>
      {url ? (
        <>
          {/* Images are proxied by the server after validating the admin session. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Ảnh trong dữ liệu đã xoá" />
          <a
            className="text-button"
            href={url}
            download={name.split("/").at(-1)}
          >
            Tải ảnh
          </a>
        </>
      ) : (
        <Notice error={error} text={error ? undefined : "Đang mở ảnh…"} />
      )}
    </figure>
  );
}
function ArchiveDetail({ id }: { id: string }) {
  const detail = useQuery({
    queryKey: ["admin", "detail", id],
    queryFn: () => adminRequest(`detail?id=${id}`, detailSchema),
    refetchInterval: 30_000,
  });
  if (detail.isPending) return <Loading text="Đang đọc bản lưu…" />;
  if (!detail.data)
    return <Notice error={detail.error} retry={() => void detail.refetch()} />;
  const archive = detail.data;
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(archive, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `couple-archive-${archive.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className={`panel ${styles.detail}`}>
      <h2>Chi tiết bản lưu</h2>
      <p>
        <strong>{archive.display_name ?? "Chưa đặt tên"}</strong> ·{" "}
        {archive.email}
      </p>
      <p className="muted">
        {statusLabels[archive.status]} · {dateLabel(archive.created_at)}
      </p>
      <Button className="button-secondary" onClick={download}>
        Tải bản dữ liệu JSON
      </Button>
      <div className={styles.stats}>
        {Object.entries(archive.payload)
          .filter(([, value]) => Array.isArray(value))
          .map(([key, value]) => (
            <div key={key}>
              <strong>{(value as unknown[]).length}</strong>
              <span>
                {(
                  {
                    wishes: "Mong muốn",
                    draws: "Thẻ đã mở",
                    memories: "Kỷ niệm",
                    couples: "Kết nối",
                    members: "Thành viên",
                    invites: "Mã mời",
                    requests: "Yêu cầu",
                    history: "Lịch sử",
                  } as Record<string, string>
                )[key] ?? key}
              </span>
            </div>
          ))}
      </div>
      {archive.files.length > 0 && (
        <>
          <h3>Ảnh đã lưu ({archive.files.length})</h3>
          <div className={styles.photos}>
            {archive.files.map((file, index) => (
              <ArchivePhoto
                key={file.archiveKey}
                id={archive.id}
                index={index}
                name={file.name}
              />
            ))}
          </div>
        </>
      )}
      <details>
        <summary>Xem toàn bộ dữ liệu</summary>
        <pre className={styles.json}>
          {JSON.stringify(archive.payload, null, 2)}
        </pre>
      </details>
    </section>
  );
}
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
  const [kind, setKind] = useState<"account" | "connection" | "">("");
  const [selected, setSelected] = useState<string>();
  const rows = useInfiniteQuery({
    queryKey: ["admin", "deleted-data", kind],
    initialPageParam: undefined as { at: string; id: string } | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) {
        params.set("before", pageParam.at);
        params.set("beforeId", pageParam.id);
      }
      if (kind) params.set("kind", kind);
      return adminRequest(`list?${params}`, z.array(rowSchema));
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
        title="Dữ liệu đã xoá."
        description="Bản lưu lịch sử kết nối và tài khoản đã xoá. Cần phiên đăng nhập quản trị riêng để xem."
      />
      <Notice error={logoutError} />
      <div className="button-row">
        {(
          [
            { value: "", label: "Tất cả" },
            { value: "account", label: "Tài khoản" },
            { value: "connection", label: "Lịch sử kết nối" },
          ] as const
        ).map((filter) => (
          <Button
            key={filter.value}
            className={kind === filter.value ? "" : "button-secondary"}
            onClick={() => {
              setKind(filter.value);
              setSelected(undefined);
            }}
          >
            {filter.label}
          </Button>
        ))}
        <Button
          className="button-secondary"
          busy={rows.isFetching}
          onClick={() => void rows.refetch()}
        >
          Làm mới
        </Button>
      </div>
      <Notice error={rows.error} retry={() => void rows.refetch()} />
      {rows.isPending ? (
        <Loading text="Đang đọc dữ liệu đã xoá…" />
      ) : (
        <div className={styles.records}>
          {!all.length && (
            <p className="muted">Chưa có dữ liệu đã xoá trong nhóm này.</p>
          )}
          {all.map((row) => (
            <article key={row.id} className={`panel ${styles.record}`}>
              <div>
                <span className="eyebrow">
                  {row.kind === "account" ? "TÀI KHOẢN" : "LỊCH SỬ KẾT NỐI"}
                </span>
                <h2>{row.display_name ?? "Chưa đặt tên"}</h2>
                <p>{row.email}</p>
                <p className="muted">
                  {dateLabel(row.created_at)} · {statusLabels[row.status]} ·{" "}
                  {row.photo_count} ảnh
                </p>
              </div>
              <Button
                className="button-secondary"
                onClick={() => setSelected(row.id)}
                aria-pressed={selected === row.id}
              >
                Xem bản lưu
              </Button>
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
          Xem bản lưu cũ hơn
        </Button>
      )}
      {selected && <ArchiveDetail key={selected} id={selected} />}
    </main>
  );
}
