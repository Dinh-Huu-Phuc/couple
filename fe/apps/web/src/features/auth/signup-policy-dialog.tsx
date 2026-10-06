import Image from "next/image";
import { Button, Dialog } from "@/components/ui";

export type SignupPolicyPage = "terms" | "privacy";

export function SignupPolicyDialog({
  page,
  inactivityDays,
  close,
}: {
  page: SignupPolicyPage;
  inactivityDays: number;
  close: () => void;
}) {
  return (
    <Dialog
      title={
        page === "terms" ? "Điều khoản sử dụng" : "Chính sách quyền riêng tư"
      }
      close={close}
    >
      <div className="signup-policy-content">
        {page === "terms" ? (
          <>
            <p>
              COUPLE là không gian để hai người kết nối, viết thư và lưu kỷ
              niệm. Mỗi người dùng một tài khoản và chịu trách nhiệm giữ an toàn
              thông tin đăng nhập của mình.
            </p>
            <h3>Sử dụng phù hợp</h3>
            <p>
              Không dùng app để gửi spam, quấy rối, xâm phạm quyền của người
              khác hoặc lạm dụng dịch vụ. Chủ ứng dụng có thể ban hoặc xoá tài
              khoản vi phạm sau khi ghi nhận lý do xử lý.
            </p>
            <h3>Tài khoản không hoạt động</h3>
            <p>
              Tài khoản đã chấp nhận quy định này có thể được tự động xoá sau{" "}
              {inactivityDays} ngày liên tiếp không sử dụng app. Khi cậu quay
              lại sử dụng trước lúc bắt đầu xoá, thời gian được tính lại. Nếu
              mốc ngày thay đổi, app sẽ yêu cầu cậu chấp nhận mốc mới.
            </p>
            <h3>Khi xoá tài khoản</h3>
            <p>
              Tài khoản, nội dung riêng và kỷ niệm chung có liên quan sẽ bị xoá,
              kể cả kỷ niệm do người kết nối tạo. Mong muốn riêng của người còn
              lại được giữ. Tài khoản và nội dung đã xoá không thể tự khôi phục.
            </p>
          </>
        ) : (
          <>
            <p>
              COUPLE dùng email để tạo tài khoản, xác nhận đăng nhập và gửi liên
              kết đặt lại mật khẩu. App lưu hồ sơ, thư, mong muốn, ảnh và kỷ
              niệm mà cậu chủ động tạo để cung cấp các tính năng cho hai người.
            </p>
            <h3>Ai có thể xem dữ liệu?</h3>
            <p>
              Nội dung chung được hiển thị cho người cậu kết nối theo tính năng
              của app. Trang quản trị dùng thông tin tài khoản và trạng thái
              hoạt động để vận hành, xử lý vi phạm và yêu cầu xoá; trang này
              không dùng để đọc thư hay ảnh của người dùng.
            </p>
            <h3>Thời gian lưu và xoá</h3>
            <p>
              App ghi nhận lần sử dụng gần nhất để áp dụng thời hạn không hoạt
              động {inactivityDays} ngày. Cậu có thể yêu cầu xoá tài khoản trong
              phần Cài đặt. Việc xoá gỡ dữ liệu đang phục vụ trong app; bản sao
              lưu hạ tầng có thể còn trong thời hạn lưu của nhà cung cấp.
            </p>
            <h3>Dịch vụ hỗ trợ</h3>
            <p>Cậu có thể liên hệ chủ ứng dụng qua email hoặc Zalo:</p>
            <div className="signup-contact-links">
              <a href="mailto:phucgp74@gmail.com">
                <Image
                  src="/icons/envelope-regular-full.svg"
                  alt=""
                  width={22}
                  height={22}
                />
                <span>phucgp74@gmail.com</span>
              </a>
              <a
                href="https://zalo.me/0398743229"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab-vn fab-vn-zalo" aria-hidden="true">
                  Zalo
                </i>
                <span>0398743229</span>
              </a>
            </div>
          </>
        )}
      </div>
      <div className="button-row">
        <Button type="button" onClick={close}>
          Đồng ý
        </Button>
      </div>
    </Dialog>
  );
}
