"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/components/app-shell";
import { Button, Notice } from "@/components/ui";
import { inactivityStatus } from "@/lib/inactivity";

export function InactivityPolicy() {
  const { client, userId } = useApp();
  const status = useQuery({
    queryKey: [userId, "inactivity"],
    queryFn: inactivityStatus,
  });
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  return (
    <section className="panel">
      <h2>Tài khoản không hoạt động</h2>
      <Notice error={status.error} retry={() => void status.refetch()} />
      {status.data && (
        <>
          <p>
            COUPLE tự động xoá tài khoản sau {status.data.days} ngày liên tiếp
            không sử dụng app. Khi cậu quay lại sử dụng, thời gian được tính lại
            từ lần hoạt động mới nhất.
          </p>
          <p>
            Tài khoản, nội dung riêng và kỷ niệm chung liên quan sẽ bị xoá, kể
            cả kỷ niệm do người ấy tạo. Mong muốn riêng của người ấy được giữ.
            Không có bản sao nội dung mới trong trang quản trị; nhật ký xử lý
            được dọn sau 30 ngày. Dữ liệu trong bản sao lưu hạ tầng có thể còn
            đến khi hết chu kỳ lưu.
          </p>
          {status.data.accepted ? (
            <p>
              Cậu đã chấp nhận mốc hiện tại. Khi mốc thay đổi, cậu sẽ cần đọc và
              chấp nhận lại.
            </p>
          ) : (
            <>
              <p>
                Tài khoản của cậu chưa áp dụng quy định này cho đến khi cậu chấp
                nhận.
              </p>
              <label style={{ display: "flex", alignItems: "start", gap: 10 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  style={{ width: "auto" }}
                />
                Tôi chấp nhận việc tự động xoá tài khoản và dữ liệu liên quan
                sau {status.data.days} ngày không hoạt động.
              </label>
              <Notice error={error} />
              <Button
                busy={busy}
                disabled={!checked}
                onClick={async () => {
                  setBusy(true);
                  setError(undefined);
                  try {
                    const result = await client
                      .schema("api")
                      .rpc("accept_inactivity_policy", {
                        p_version: status.data!.version,
                      });
                    if (result.error) throw result.error;
                    setChecked(false);
                    await status.refetch();
                  } catch (e) {
                    setError(e);
                    await status.refetch();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Chấp nhận quy định
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}
