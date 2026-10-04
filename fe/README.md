<h1 align="center">💌 COUPLE</h1>

<p align="center">
  <strong>Những điều ngại nói, để Couple mở lời.</strong>
</p>

<p align="center">
  Viết xuống mong muốn nhỏ — khám phá điều người ấy đang mong chờ.<br />
  Cùng nhau biến những điều giản dị thành kỷ niệm.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Made_with-Love-B65B72?style=flat-square" alt="Made with Love" />
</p>

<p align="center">
  <a href="#-về-couple">Giới thiệu</a>
  ·
  <a href="#-trải-nghiệm">Trải nghiệm</a>
  ·
  <a href="#-bắt-đầu">Bắt đầu</a>
  ·
  <a href="#-dành-cho-developer">Phát triển</a>
</p>

<!-- Thay URL bên dưới bằng địa chỉ website thật trước khi công khai. -->
<p align="center">
  <a href="https://TEN-DU-AN.vercel.app">
    <img src="https://img.shields.io/badge/Website-Trải_nghiệm_Couple-B65B72?style=for-the-badge&logo=vercel&logoColor=white" alt="Trải nghiệm Couple" />
  </a>
</p>

---

## 💞 Về Couple

“Cuối tuần này, mình đi ăn lẩu nhé?”

“Tớ muốn một buổi tối hai đứa không dùng điện thoại.”

“Hôm nay, chỉ cần cậu nghe tớ kể một chút thôi.”

Có những điều rất nhỏ nhưng lại không dễ mở lời.

**Couple** được tạo ra để mỗi người có thể viết xuống mong muốn
của mình, rồi để người ấy khám phá qua những lần bốc thẻ bất ngờ.

Một món ăn đang thèm, một buổi hẹn đã lâu chưa có,
hay một chút quan tâm giữa ngày bận rộn —
tất cả đều có thể trở thành lời nhắn dành cho nhau.

> Một điều nhỏ, thêm gần nhau.

## ✨ Trải nghiệm

Couple được xây dựng xoay quanh những trải nghiệm sau:

| | Tính năng | Ý nghĩa |
| :---: | --- | --- |
| 🔗 | **Kết nối người ấy** | Bắt đầu không gian chung bằng mã mời và sự xác nhận của cả hai. |
| ✍️ | **Hộp mong muốn** | Viết những điều muốn ăn, muốn làm hoặc muốn cùng nhau trải nghiệm. |
| 💌 | **Bốc thẻ bất ngờ** | Khám phá ngẫu nhiên một mong muốn của đối phương. |
| 🤍 | **Phản hồi nhẹ nhàng** | Nhận thực hiện, cùng bàn thêm hoặc để một dịp phù hợp hơn. |
| 📸 | **Lưu giữ kỷ niệm** | Ghi lại những điều đã cùng thực hiện bằng lời nhắn và hình ảnh. |

## 🌷 Bắt đầu

### 1. Kết nối với nhau

Tạo tài khoản, gửi mã mời cho người ấy và xác nhận ghép đôi.

### 2. Viết điều mình mong muốn

Không cần viết thật hay.
Chỉ cần đó là điều cậu muốn chia sẻ với người mình yêu.

### 3. Mở một điều bất ngờ

Bốc một thẻ để biết người ấy đang mong chờ điều gì.
Biết đâu, đó là một việc rất nhỏ mà cậu có thể làm ngay hôm nay.

### 4. Cùng tạo thêm kỷ niệm

Chọn điều phù hợp với cả hai và lưu lại khoảnh khắc khi đã thực hiện.

## 🫶 Điều Couple hướng đến

**Bày tỏ chân thành.** Không bắt đối phương phải đoán mọi điều.

**Quan tâm tự nguyện.** Mong muốn là lời gợi mở, không phải nghĩa vụ.

**Thấu hiểu từng chút.** Không chấm điểm tình cảm hay so sánh
ai đã làm nhiều hơn.

Couple không thay thế những cuộc trò chuyện.
Couple giúp hai người có thêm một cách để bắt đầu.

## 🛠️ Dành cho developer

Web sử dụng **Next.js**, backend sử dụng **Supabase**.
Hai phần được quản lý độc lập trong `fe/` và `be/`.

| Thành phần | Thư mục | Tài liệu |
| --- | --- | --- |
| Frontend Next.js | `fe/` | [Hướng dẫn frontend](README.md) |
| Backend Supabase | `be/` | [Hướng dẫn backend](../be/README.md) |

<details>
<summary><strong>⚙️ Chạy dự án trên máy</strong></summary>

### Yêu cầu

- Node.js và Corepack theo phiên bản yêu cầu của dự án.
- pnpm theo cấu hình `packageManager`.
- Project Supabase đã được cấu hình.

### Cài đặt và khởi động

Chạy từ thư mục gốc repository:

~~~powershell
cd fe
corepack pnpm install --frozen-lockfile
cd ..
npm run dev:web
~~~

Máy mới cần sao chép `.env.example` sang `.env.local`
trong `fe/apps/web/` và điền các biến public của Supabase.

Mở [http://localhost:3001](http://localhost:3001).

### Kiểm tra

~~~powershell
npm run typecheck
npm run lint
npm run test
npm run build:web
~~~

Để chạy bản đã build:

~~~powershell
npm run start:web
~~~

Dừng phiên development trước khi chạy bản build vì hai lệnh
dùng cùng cổng `3001`.

Xem README của frontend và backend để biết cách cấu hình chi tiết.
Không commit file môi trường chứa thông tin bí mật.

</details>

---

<p align="center">
  <strong>Không cần món quà lớn. Một chút quan tâm cũng đủ.</strong>
</p>

<p align="center">
  💌 COUPLE · Một điều nhỏ, thêm gần nhau.
  <br/>
  DEV DINH HUU PHUC - HOANG🫧
</p>
