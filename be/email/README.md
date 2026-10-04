# Email COUPLE trên Production

Website chính: `https://www.coupleletters.app` (`coupleletters.app` chuyển hướng sang `www`). Địa chỉ gửi thư xác minh và đặt lại mật khẩu: `COUPLE <no-reply@auth.coupleletters.app>`.

Supabase Auth quản lý tài khoản, token và link xác minh. Resend gửi thư qua Custom SMTP. Domain `auth.coupleletters.app` đã được Resend xác minh bằng DNS trên Vercel. SMTP credential nằm trong Supabase Auth; không đưa API key vào frontend, Git hay `NEXT_PUBLIC_*`.

## Cấu hình production

- Supabase Authentication → URL Configuration: Site URL `https://www.coupleletters.app`.
- Redirect URLs: `/auth/callback` và `/auth/callback?**` trên `www.coupleletters.app`. Giữ URL cũ trên `couple-three-pi.vercel.app` khi thư đã phát trước đó còn hiệu lực.
- Supabase Authentication → Emails → SMTP Settings: sender `no-reply@auth.coupleletters.app`, sender name `COUPLE`, host `smtp.resend.com`, port `465`, user `resend`; password là Resend API key chỉ lưu trong dashboard Supabase.
- Supabase Authentication → Rate Limits: kiểm tra mức gửi của Supabase và Resend trước khi mở đăng ký lớn. Giới hạn per-user 60 giây là khoảng nghỉ giữa hai thư tới cùng người dùng, khác với giới hạn tổng số thư/giờ.
- Tắt link tracking trong Resend để không viết lại URL xác minh một lần.

Hai mẫu HTML được lưu tại `templates/confirmation.html` và `templates/recovery.html`. Chúng dùng `{{ .ConfirmationURL }}` để bảo toàn luồng xác minh PKCE và callback của web; `{{ .SiteURL }}` trỏ tới web chính. Không thay bằng link tĩnh hoặc token giả.

## Triển khai Auth manifest

Manifest tại `be/deploy/production-auth/supabase/config.toml` chỉ khai báo Site URL, redirect URLs, yêu cầu xác minh email và hai mẫu thư. Nó không khai báo SMTP hay giới hạn gửi, nên `config push` không được phép ghi đè các giá trị đó. Trước khi push, kiểm tra `config diff` để chắc chắn danh sách thay đổi chỉ gồm những mục dự định cập nhật.

```powershell
cd be
node email/prepare-deploy.mjs
corepack pnpm exec supabase config diff --workdir md/production-auth-deploy --project-ref ldxekwjpzxsnhhcvvlfi
corepack pnpm exec supabase config push --workdir md/production-auth-deploy --project-ref ldxekwjpzxsnhhcvvlfi
```

`be/md/production-auth-deploy` là bản sao sinh ra từ các file Git và bị ignore. Không chép `.env` hoặc SMTP key vào đó. Sau khi cập nhật, thử đăng ký và đặt lại mật khẩu bằng tài khoản thử do mình kiểm soát; kiểm tra From, nội dung và callback trên domain mới.

Tham khảo: [Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Supabase Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates), [Resend SMTP](https://resend.com/docs/send-with-smtp).
