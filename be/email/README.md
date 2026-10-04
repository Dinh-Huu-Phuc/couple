# Email gửi từ COUPLE

Website Production hiện dùng `https://couple-three-pi.vercel.app`. Đây là subdomain
Vercel cấp cho web, không phải domain gửi mail mà mình sở hữu DNS. Thư xác nhận
và reset vẫn do SMTP mặc định của Supabase gửi. Mẫu tiếng Việt trong thư mục này
đã chuẩn bị nhưng chưa thể áp dụng lên hosted Auth: Supabase Free từ chối chỉnh
template khi dùng dịch vụ email mặc định và yêu cầu Custom SMTP.
`couple@mail.hoang.io` là ví dụ, chưa phải địa chỉ From thực tế.

## Redirect xác minh trên Production

Hosted Supabase Auth Site URL phải là `https://couple-three-pi.vercel.app`, và
redirect allowlist phải chứa `/auth/callback` cùng các URL callback có query `next`.
Manifest Production chỉ khai báo Site URL, allowlist và yêu cầu xác minh email;
cấu hình
`be/supabase/config.toml` vẫn phục vụ local. Để kiểm tra và áp dụng cấu hình:

```powershell
cd be
node email/prepare-deploy.mjs
corepack pnpm exec supabase config diff --workdir md/production-auth-deploy --project-ref ldxekwjpzxsnhhcvvlfi
corepack pnpm exec supabase config push --workdir md/production-auth-deploy --project-ref ldxekwjpzxsnhhcvvlfi
```

Thư mục `be/md/production-auth-deploy` là bản sao sinh ra từ các file Git; không
chứa `.env`. Kiểm tra diff trước khi push để không thay đổi các cấu hình Auth
khác. Mẫu sẽ dùng `{{ .ConfirmationURL }}` để token được Supabase xác minh trước khi
điều hướng về callback của COUPLE. User phải xác minh email trước khi đăng nhập;
localhost và web deploy trỏ cùng một Supabase Auth, nên sau khi xác minh một lần
thì tài khoản có thể đăng nhập từ cả hai địa chỉ. Đây là trạng thái tài khoản
chung, không phải một phiên đăng nhập vượt qua bước xác minh.
Thư đã gửi trước khi đổi Site URL vẫn chứa link cũ; người dùng cần yêu cầu gửi
lại từ domain Production hoặc đăng ký bằng tài khoản thử mới.

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
4. Khi đổi sang domain web do mình sở hữu, cập nhật Site URL và redirect allowlist
   sang domain HTTPS đó. Domain web có thể khác domain gửi mail. Chỉ dùng địa chỉ
   From thuộc domain mình có quyền quản lý DNS.
5. Sau khi bật Custom SMTP, trong Email Templates dùng các file sau cho từng loại thư:

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

## Điều chưa thực hiện cho địa chỉ From riêng

- Chưa chọn/mua hoặc xác minh domain gửi mail có quyền quản lý DNS. Subdomain
  `vercel.app` không cấp cho project quyền tự đặt SPF/DKIM để gửi email từ đó.
- Chưa có SMTP credentials; chưa bật Custom SMTP trên project. Vì thế mẫu
  COUPLE chưa thể áp dụng cho thư thật.
- Chưa gửi thử thư thật qua Custom SMTP provider.
- Chưa cấu hình receiving nếu muốn người dùng trả lời về địa chỉ From.

Nguồn chính thức:

- [Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
- [Supabase Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates).
- [Resend + Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp).
- [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction).
