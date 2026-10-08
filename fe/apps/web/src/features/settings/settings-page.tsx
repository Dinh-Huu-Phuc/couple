"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppError } from "@couple/domain";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-shell";
import { Button, Dialog, Notice, PageHeading } from "@/components/ui";
import { ProfileForm } from "./profile-form";
import { InactivityPolicy } from "./inactivity-policy";
import { useAction } from "@/lib/use-action";
import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { ThemeSettings } from "@/components/theme";
export function SettingsPage() {
  const { context, api, client, email, refresh } = useApp();
  const action = useAction();
  const cache = useQueryClient();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteEmail, setDeleteEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const deleteLock = useRef(false);
  const [deleteError, setDeleteError] = useState<unknown>();
  async function deleteAccount() {
    if (deleteLock.current) return;
    deleteLock.current = true;
    setDeleting(true);
    setDeleteError(undefined);
    try {
      const result = await client.functions.invoke("delete-account", {
        body: { confirmation: deletePhrase, email: deleteEmail, password },
      });
      if (result.error || result.data?.ok !== true) {
        let code =
          result.data?.error?.code ??
          (result.error &&
          !(
            "context" in result.error &&
            result.error.context instanceof Response
          )
            ? "DELETION_CONNECTION_FAILED"
            : "DELETION_RETRY_REQUIRED");
        if (
          result.error &&
          "context" in result.error &&
          result.error.context instanceof Response
        ) {
          const body = await result.error.context.json().catch(() => null);
          if (typeof body?.error?.code === "string") code = body.error.code;
        }
        throw new AppError(code);
      }
      setPassword("");
      await cache.cancelQueries();
      cache.clear();
      await client.auth.signOut({ scope: "local" });
      router.replace("/login?account=deleted");
      router.refresh();
    } catch (error) {
      setDeleteError(error);
      await refresh();
    } finally {
      deleteLock.current = false;
      setDeleting(false);
    }
  }
  async function signout() {
    await action.run(async () => {
      await cache.cancelQueries();
      cache.clear();
      const { error } = await client.auth.signOut();
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    });
  }
  return (
    <>
      <PageHeading
        eyebrow="CHĂM CHÚT KHOẢNG RIÊNG"
        title="Một chút về cậu."
        description="Tên, múi giờ và lựa chọn kết nối của cậu."
      />
      {context.deletionPending && (
        <Notice text="Yêu cầu xoá tài khoản đang xử lý. Cậu tiếp tục xoá bên dưới để hoàn tất việc lưu dữ liệu và đóng tài khoản." />
      )}
      <div className="settings-grid">
        <section className="panel">
          <h2>Hồ sơ của cậu</h2>
          {context.deletionPending ? (
            <p>Hồ sơ đang chờ xoá.</p>
          ) : (
            <ProfileForm />
          )}
        </section>
        <ThemeSettings />
        <section className="panel">
          <h2>Tài khoản</h2>
          <p>{email}</p>
          <p className="muted">
            Email đã được xác nhận. Để đổi mật khẩu, yêu cầu một liên kết qua
            email.
          </p>
          <a href="/forgot-password" className="button button-secondary">
            Đặt lại mật khẩu
          </a>
          <Button
            className="button-secondary"
            busy={action.busy}
            onClick={() => void signout()}
          >
            Đăng xuất
          </Button>
        </section>
        <section className="panel support-panel">
          <CircleHelp size={24} />
          <div>
            <h2>Hỗ trợ & góp ý</h2>
            <p className="muted">Xem câu hỏi thường gặp, báo lỗi hoặc gửi đề xuất cho COUPLE.</p>
            <Link href="/support" className="button button-secondary">Mở trang hỗ trợ</Link>
          </div>
        </section>
      </div>
      <Notice error={action.error} />
      {!context.deletionPending && <InactivityPolicy />}
      <section className="panel danger-panel">
        <h2>Xoá tài khoản</h2>
        <p>
          Tài khoản, nội dung của cậu và kỷ niệm chung liên quan sẽ được xóa
          khỏi dữ liệu đang hoạt động. Luồng xóa không tạo thêm bản sao nội dung
          trong khu vực quản trị.
        </p>
        <Button
          className="button-danger"
          onClick={() => {
            setDeleteDialog(true);
            setDeleteError(undefined);
          }}
        >
          {context.deletionPending
            ? "Tiếp tục xoá tài khoản"
            : "Xem thông tin xoá tài khoản"}
        </Button>
      </section>
      {deleteDialog && (
        <Dialog
          title="Xoá tài khoản của cậu?"
          close={() => {
            if (!deleting) {
              setDeleteDialog(false);
              setPassword("");
            }
          }}
        >
          <p>
            Thao tác này xoá tài khoản đăng nhập, hồ sơ và dữ liệu của cậu khỏi
            dữ liệu đang hoạt động. Nếu đang kết nối, hai người sẽ được ngắt kết
            nối. Kỷ niệm chung liên quan cũng bị xóa, kể cả khi người ấy tạo.
            Mong muốn riêng do người ấy viết vẫn được giữ.
          </p>
          <p>
            Quản trị viên chỉ theo dõi mã yêu cầu, thời điểm và kết quả xử lý.
            Sau khi hoàn tất, nhật ký này không giữ email, tên, nội dung hay ảnh
            của cậu và được dọn sau 30 ngày, vào đợt dọn hằng ngày tiếp theo.
            Cậu không thể tự khôi phục tài khoản.
          </p>
          <p className="muted">
            Các bản lưu cũ được tạo trước thay đổi này (nếu có) hiện bị chặn
            truy cập trong trang quản trị và chưa được xóa. Bản sao lưu hạ tầng
            có thể còn dữ liệu đến khi hết chu kỳ lưu của nhà cung cấp.
          </p>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void deleteAccount();
            }}
          >
            <label>
              Email xác nhận
              <input
                type="email"
                value={deleteEmail}
                onChange={(event) => setDeleteEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label>
              Mật khẩu hiện tại
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              Nhập “XOÁ TÀI KHOẢN” để xác nhận
              <input
                value={deletePhrase}
                onChange={(event) => setDeletePhrase(event.target.value)}
                required
                autoComplete="off"
              />
            </label>
            <Notice error={deleteError} />
            <div className="button-row">
              <Button
                type="button"
                className="button-secondary"
                disabled={deleting}
                onClick={() => {
                  setDeleteDialog(false);
                  setPassword("");
                }}
              >
                Giữ tài khoản
              </Button>
              <Button
                type="submit"
                className="button-danger"
                busy={deleting}
                disabled={
                  deletePhrase !== "XOÁ TÀI KHOẢN" ||
                  deleteEmail.trim().toLowerCase() !== email.toLowerCase() ||
                  !password
                }
              >
                Xác nhận xoá tài khoản
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {context.couple && (
        <section className="panel danger-panel">
          <h2>Ngắt kết nối</h2>
          <p>
            Đây là lựa chọn riêng của cậu. Hãy đọc kỹ những thay đổi trước khi
            xác nhận.
          </p>
          <Button className="button-danger" onClick={() => setConfirm(true)}>
            Xem thông tin ngắt kết nối
          </Button>
        </section>
      )}
      {confirm && (
        <Dialog
          title="Ngắt kết nối hai mình?"
          close={() => {
            if (!action.busy) setConfirm(false);
          }}
        >
          <p>
            Cả hai sẽ mất quyền đọc lịch sử chung, thẻ đã mở và ảnh kỷ niệm của
            cặp này. Các thẻ chưa xử lý sẽ được đóng.
          </p>
          <p>
            Cậu giữ quyền xem mong muốn do mình viết ở dạng chỉ đọc. Nội dung
            cặp cũ sẽ không được chuyển sang kết nối mới.
          </p>
          <p>
            Thao tác này không xóa được nội dung người ấy đã đọc, tải xuống hoặc
            chụp màn hình.
          </p>
          <label>
            Nhập “NGẮT KẾT NỐI” để xác nhận
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
            />
          </label>
          <Notice error={action.error} />
          <div className="button-row">
            <Button
              className="button-secondary"
              disabled={action.busy}
              onClick={() => setConfirm(false)}
            >
              Giữ kết nối
            </Button>
            <Button
              className="button-danger"
              busy={action.busy}
              disabled={phrase !== "NGẮT KẾT NỐI"}
              onClick={() =>
                void action.run(
                  () =>
                    api.end(
                      context.couple!.id,
                      action.keys.get("end", context.couple!.id),
                    ),
                  async () => {
                    await cache.cancelQueries();
                    cache.clear();
                    setConfirm(false);
                    router.replace("/connect");
                  },
                )
              }
            >
              Xác nhận ngắt kết nối
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
