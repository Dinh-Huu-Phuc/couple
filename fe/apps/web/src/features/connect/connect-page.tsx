"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Copy,
  Heart,
  Link as LinkIcon,
  ArrowRight,
  Plus,
  Trash2,
} from "lucide-react";
import { dateLabel, initials, type ConnectionRequest } from "@couple/domain";
import { queryKeys } from "@couple/api";
import { useApp } from "@/components/app-shell";
import {
  Button,
  Dialog,
  Empty,
  Envelope,
  Notice,
  PageHeading,
} from "@/components/ui";
import { useAction } from "@/lib/use-action";
export function ConnectPage() {
  const { api, userId, context } = useApp();
  const params = useSearchParams();
  const action = useAction();
  const [deleting, setDeleting] = useState<ConnectionRequest>();
  const [code, setCode] = useState(params.get("code")?.toUpperCase() ?? "");
  const [invite, setInvite] =
    useState<Awaited<ReturnType<typeof api.invite>>>();
  const [preview, setPreview] =
    useState<Awaited<ReturnType<typeof api.preview>>>();
  const requests = useInfiniteQuery({
    queryKey: queryKeys.requests(userId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.requests(pageParam),
    getNextPageParam: (last) => {
      // Use the newest of the two full-page boundaries so neither group skips rows.
      // Groups overlap across pages; deduplicate them below.
      return [last.incoming, last.outgoing]
        .filter((rows) => rows.length === 20)
        .map((rows) => rows.at(-1)!.createdAt)
        .sort()
        .at(-1);
    },
    refetchInterval: 30_000,
    enabled: !context.couple,
  });
  const unique = (rows: ConnectionRequest[]) => [
    ...new Map(rows.map((r) => [r.id, r])).values(),
  ];
  const incoming = unique(
    requests.data?.pages.flatMap((p) => p.incoming) ?? [],
  );
  const outgoing = unique(
    requests.data?.pages.flatMap((p) => p.outgoing) ?? [],
  );
  const statuses: Record<ConnectionRequest["status"], string> = {
    pending: "Đang chờ",
    accepted: "Đã kết nối",
    rejected: "Đã từ chối",
    cancelled: "Đã hủy",
    expired: "Đã hết hạn",
    ended: "Đã ngắt kết nối",
  };
  const date = (v: string) => dateLabel(v, context.profile.timezone);
  async function copy(text: string) {
    await action.run(async () => {
      await navigator.clipboard.writeText(text);
      action.setMessage("Đã sao chép. Cậu gửi riêng cho người ấy nhé.");
    });
  }
  if (context.couple)
    return (
      <Empty
        title="Hai mình đã kết nối"
        text="Khoảng riêng của hai người đã sẵn sàng."
      >
        <a href="/home" className="button">
          Về Hai mình
        </a>
      </Empty>
    );
  return (
    <>
      <PageHeading
        eyebrow="CHỈ HAI NGƯỜI, MỘT KHOẢNG RIÊNG"
        title="Mời người thương ghé vào."
        description="Một lời mời nhỏ, và sự đồng ý từ cả hai."
      />
      <Notice error={action.error} text={action.message} />
      <div className="connect-grid">
        <section className="panel invite-panel">
          <Envelope small />
          <h2>Gửi lời mời của cậu</h2>
          <p>
            Tạo mã và gửi riêng cho người ấy.
            <br />
            Mã có hiệu lực trong 24 giờ.
          </p>
          {invite ? (
            <>
              <output className="invite-code" data-testid="invite-code">
                {invite.code}
              </output>
              <p className="muted">Hết hạn: {date(invite.expiresAt)}</p>
              <div className="button-row">
                <Button
                  className="button-secondary"
                  busy={action.busy}
                  onClick={() => void copy(invite.code)}
                >
                  <Copy size={16} />
                  Sao chép mã
                </Button>
                <Button
                  className="button-secondary"
                  busy={action.busy}
                  onClick={() =>
                    void copy(
                      `${window.location.origin}/connect?code=${invite.code}`,
                    )
                  }
                >
                  <LinkIcon size={16} />
                  Sao chép link
                </Button>
              </div>
            </>
          ) : (
            context.activeInvite && (
              <p className="notice">
                Cậu đang có một mã còn hiệu lực. Mã chỉ hiện ở lần tạo; tạo mới
                sẽ hủy mã cũ và các yêu cầu đang chờ từ mã đó.
              </p>
            )
          )}
          <Button
            busy={action.busy}
            onClick={() =>
              void action.run(
                () => api.invite(action.keys.get("invite", {})),
                (result) => {
                  action.keys.clear("invite", {});
                  setInvite(result);
                },
              )
            }
          >
            <Plus size={17} />
            {invite || context.activeInvite ? "Tạo mã mới" : "Tạo mã mời"}
          </Button>
          {context.activeInvite && (
            <button
              className="text-button"
              disabled={action.busy}
              onClick={() =>
                void action.run(
                  () => api.revoke(context.activeInvite!.id),
                  () => setInvite(undefined),
                )
              }
            >
              Thu hồi mã mời
            </button>
          )}
        </section>
        <section className="panel">
          <span className="icon-tile">
            <Heart size={25} />
          </span>
          <h2>Nhận lời mời từ người ấy</h2>
          <p>
            Cậu có mã rồi? Nhập bên dưới để xem người mời trước khi gửi yêu cầu.
          </p>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(() => api.preview(code.trim()), setPreview);
            }}
          >
            <label>
              Mã mời
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setPreview(undefined);
                }}
                placeholder="10 ký tự trên lời mời"
                minLength={10}
                maxLength={10}
                required
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <Button type="submit" busy={action.busy}>
              Xem lời mời
              <ArrowRight size={17} />
            </Button>
          </form>
          {preview && (
            <div className="preview-person">
              <span className="avatar">
                {initials(preview.inviter.displayName)}
              </span>
              <h3>{preview.inviter.displayName} đang mời cậu</h3>
              <p>
                Gửi yêu cầu rồi chờ người ấy xác nhận. Hai người sẽ ghép đôi sau
                khi người ấy đồng ý.
              </p>
              <Button
                busy={action.busy}
                onClick={() =>
                  void action.run(
                    () =>
                      api.connect(
                        code.trim(),
                        action.keys.get("connect", code.trim()),
                      ),
                    () => {
                      action.keys.clear("connect", code.trim());
                      setPreview(undefined);
                      action.setMessage(
                        "Đã gửi yêu cầu. Mình chờ người ấy xác nhận nhé.",
                      );
                    },
                  )
                }
              >
                Gửi yêu cầu kết nối
              </Button>
            </div>
          )}
        </section>
      </div>
      <section className="request-section">
        <PageHeading
          title="Lời mời và kết nối của cậu"
          description="Cậu luôn là người quyết định có kết nối hay không."
        />
        <Notice error={requests.error} retry={() => void requests.refetch()} />
        <div className="connect-grid">
          {[
            { title: "Gửi tới cậu", rows: incoming, incoming: true },
            { title: "Cậu đã gửi", rows: outgoing, incoming: false },
          ].map((group) => (
            <section key={group.title} className="panel">
              <h2>{group.title}</h2>
              {!group.rows.length && (
                <p className="muted">Chưa có yêu cầu nào.</p>
              )}
              {group.rows.map((row) => (
                <div key={row.id} className="request-row">
                  <div>
                    <strong>
                      {(row.requester ?? row.inviter)?.displayName}
                    </strong>
                    <p className="muted">
                      {statuses[row.status]} · {date(row.createdAt)}
                    </p>
                  </div>
                  {row.status === "pending" && (
                    <div className="button-row">
                      {group.incoming ? (
                        <>
                          <Button
                            busy={action.busy}
                            onClick={() =>
                              void action.run(() =>
                                api.respondConnection(row.id, "accept"),
                              )
                            }
                          >
                            Đồng ý
                          </Button>
                          <Button
                            className="button-secondary"
                            busy={action.busy}
                            onClick={() =>
                              void action.run(() =>
                                api.respondConnection(row.id, "reject"),
                              )
                            }
                          >
                            Từ chối
                          </Button>
                        </>
                      ) : (
                        <Button
                          className="button-secondary"
                          busy={action.busy}
                          onClick={() =>
                            void action.run(() => api.cancelConnection(row.id))
                          }
                        >
                          Hủy yêu cầu
                        </Button>
                      )}
                    </div>
                  )}
                  {row.canDelete && (
                    <Button
                      className="button-secondary"
                      disabled={action.busy}
                      onClick={() => setDeleting(row)}
                    >
                      <Trash2 size={16} /> Xoá
                    </Button>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
        {requests.hasNextPage && (
          <Button
            className="button-secondary"
            busy={requests.isFetchingNextPage}
            onClick={() => void requests.fetchNextPage()}
          >
            Xem yêu cầu cũ hơn
          </Button>
        )}
      </section>
      {deleting && (
        <Dialog
          title="Xoá lịch sử kết nối?"
          close={() => {
            if (!action.busy) setDeleting(undefined);
          }}
        >
          <p>
            Dòng kết nối với{" "}
            {(deleting.requester ?? deleting.inviter)?.displayName} sẽ được xoá
            vĩnh viễn khỏi lịch sử của cậu. Người ấy vẫn giữ lựa chọn xoá lịch
            sử phía họ.
          </p>
          <p>
            Bản dữ liệu đã xoá sẽ được lưu trong khu vực riêng của quản trị
            viên. Thao tác này không xoá tài khoản người ấy hoặc mong muốn cậu
            đã viết.
          </p>
          <Notice error={action.error} />
          <div className="button-row">
            <Button
              className="button-secondary"
              disabled={action.busy}
              onClick={() => setDeleting(undefined)}
            >
              Giữ lại
            </Button>
            <Button
              className="button-danger"
              busy={action.busy}
              onClick={() =>
                void action.run(
                  () => api.deleteConnectionHistory(deleting.id),
                  () => {
                    setDeleting(undefined);
                    action.setMessage("Đã xoá lịch sử kết nối phía cậu.");
                  },
                )
              }
            >
              Xác nhận xoá lịch sử
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
