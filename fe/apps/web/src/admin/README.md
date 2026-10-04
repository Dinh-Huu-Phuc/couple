# Trang quản trị riêng

Route `/admin` được nối bởi `src/app/admin/page.tsx`; phần giao diện và kiểm tra
quyền nằm trong thư mục này. Source admin được track trong Git để clone/deploy
có đầy đủ trang và API. Dữ liệu, credential và các env thật vẫn không lên Git.

Dữ liệu không nằm trong frontend hoặc file Git: JSON ở `private.deleted_data`,
ảnh ở Storage bucket private `deleted-data`. Server kiểm tra phiên admin riêng
trong DB mỗi lần đọc JSON/ảnh; RPC archive/session chỉ backend service role
được gọi. `.gitignore` chỉ bỏ source khỏi Git, không cấp quyền.

Local đăng nhập tại `/admin` bằng `ADMIN_USERNAME`, `ADMIN_PASSWORD` trong `be/.env`.
Backend credential module: `be/admin/auth.mjs`; runtime key riêng tại
`be/.env.admin-runtime` (ignore Git). Không copy credential sang FE `.env.local`.
Cookie HttpOnly, SameSite Strict, 1 giờ; đổi credential làm mất hiệu lực các
phiên cũ, logout thu hồi phiên trong DB. Tài khoản COUPLE và email allowlist cũ
không tự cấp quyền. Xem [hướng dẫn backend](../../../../../be/md/deletion-admin.md) để cấu hình runtime/deploy.

Trên Vercel, đặt các biến server-only ở Project Settings → Environment Variables:
`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_BACKEND_SERVICE_ROLE_KEY`.
Không thêm tiền tố `NEXT_PUBLIC_` cho chúng. Backend đọc trực tiếp process env,
không cần file `be/.env` hay `.env.admin-runtime` trong deployment; thiếu cấu hình
thì API trả lỗi, không mở quyền admin. Biến public Supabase vẫn theo `.env.example`.
