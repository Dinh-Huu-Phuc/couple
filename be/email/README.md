# Email gửi từ COUPLE

Hiện trạng ngày 03/10/2026: người dùng chưa có domain; `couple@mail.hoang.io` là ví dụ.
Thư xác nhận và reset vẫn do SMTP mặc định của Supabase gửi. Các mẫu trong thư mục này
là bản chuẩn bị, chưa được áp dụng lên hosted Auth hoặc cấu hình local đang chạy.

## Kết quả cần đạt

- From hiển thị: `COUPLE <couple@mail.ten-mien-cua-ban.com>`.
- To: địa chỉ email người dùng nhập khi đăng ký/yêu cầu đặt lại mật khẩu.
- Supabase Auth tiếp tục tạo token và xử lý xác thực; Custom SMTP chuyển thư qua
  dịch vụ gửi email. Không cần tạo project Supabase mới hoặc bảng login mới.
- Xác minh đúng domain/subdomain sẽ dùng trong From. Không dùng `hoang.io` nếu
  không có quyền quản lý DNS. Địa chỉ gửi không tự tạo ra một hộp thư nhận mail.

## Cấu hình sau khi có domain

1. Chọn domain mình sở hữu và có quyền chỉnh DNS, ví dụ `ten-mien-cua-ban.com`.
2. Với Resend, thêm và xác minh subdomain `mail.ten-mien-cua-ban.com`. Thêm các DNS
   record chính xác do provider cấp; chờ trạng thái Verified. Không dùng record tự
   đoán. SPF/DKIM phục vụ xác thực gửi; DMARC cấu hình theo hướng dẫn provider.
3. Tạo credential SMTP cho tài khoản gửi. Trong Supabase project `couple`, vào
   Authentication → Email → SMTP Settings, bật Custom SMTP và điền:

   | Trường | Giá trị ví dụ với Resend |
   | --- | --- |
   | Sender email | `couple@mail.ten-mien-cua-ban.com` |
   | Sender name | `COUPLE` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | Resend API key của tài khoản gửi |

   Provider SMTP khác dùng thông số của provider đó. Credential nằm trong cấu hình
   Auth server, không ở `NEXT_PUBLIC_*`, frontend hoặc source control.
4. Kiểm tra lại Site URL và redirect allowlist: hiện dùng localhost/127.0.0.1 cổng
   3001 để phát triển; lúc deploy thay bằng domain HTTPS của web. Domain của web
   có thể khác domain gửi mail. Link localhost chỉ mở được trên máy đang chạy web.
5. Trong Email Templates, dùng các file sau cho từng loại thư:

   | Loại | Subject | Nội dung |
   | --- | --- | --- |
   | Confirm sign up | `COUPLE — Xác nhận email của cậu` | `templates/confirmation.html` |
   | Reset password | `COUPLE — Đặt lại mật khẩu` | `templates/recovery.html` |

   Giữ nguyên `{{ .ConfirmationURL }}`. Nó bảo toàn luồng PKCE `/auth/callback` và
   `next` của app hiện tại, bao gồm link mời và `/reset-password`. Không thay bằng
   link tĩnh, token giả hoặc link chứa mật khẩu. Các mẫu hiện yêu cầu mở trong cùng
   trình duyệt đã gửi yêu cầu; xác nhận trên thiết bị khác cần luồng token-hash riêng.
6. Kiểm tra From/To, nội dung tiếng Việt và link callback với một tài khoản thử do
   người dùng chỉ định. Đăng ký và reset phải hoạt động trước khi mở đăng ký rộng rãi.
   Không tự gửi mail thật tới người dùng hiện hữu.

## Điều chưa thực hiện

- Chưa chọn/mua hoặc xác minh domain.
- Chưa có SMTP credentials; chưa bật Custom SMTP trên project.
- Chưa áp dụng templates hoặc gửi thử thư thật qua provider.
- Chưa cấu hình receiving nếu muốn người dùng trả lời về địa chỉ From.

Nguồn chính thức:

- [Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
- [Supabase Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates).
- [Resend + Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp).
- [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction).
