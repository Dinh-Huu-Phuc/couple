"use client";

import { useEffect } from "react";

let shown = false;

export function SelfXssWarning() {
  useEffect(() => {
    if (shown) return;
    shown = true;

    console.log(
      "%c💌 Couple — Một khoảng riêng, chỉ hai mình.",
      "color:#914457;font-size:38px;font-weight:700;line-height:1.6",
    );
    console.log(
      "%c! Nếu ai đó bảo cậu dán mã vào đây để mở khóa tính năng hoặc xem bí mật của người ấy, đừng làm nhé. Đoạn mã đó có thể sử dụng chính tài khoản của cậu.",
      "color:#df1245;font-size:38px;font-weight:700;line-height:1.6",
    );
  }, []);

  return null;
}
