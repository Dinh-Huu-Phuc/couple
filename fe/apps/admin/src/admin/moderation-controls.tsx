"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button, Dialog, Notice } from "@/components/ui";
import { adminRequest } from "./client";

const reasons = [
  ["spam", "Spam"],
  ["harassment", "Quấy rối"],
  ["abuse", "Lạm dụng dịch vụ"],
  ["other", "Vi phạm chính sách khác"],
] as const;
type Operation = "ban" | "unban" | "delete";
export function ModerationControls({ id, email, banned, pending }: {
  id: string; email: string | null; banned: boolean; pending: boolean;
}) {
  const cache = useQueryClient();
  const [operation, setOperation] = useState<Operation | null>(null);
  const [reason, setReason] = useState<(typeof reasons)[number][0]>("spam");
  const [note, setNote] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const close = () => { if (!busy) { setOperation(null); setError(undefined); } };
  return <>
    <div className="button-row">
      <Button className="button-secondary" disabled={pending} onClick={() => setOperation(banned ? "unban" : "ban")}>{banned ? "Bỏ ban" : "Ban"}</Button>
      <Button className="button-danger" disabled={pending} onClick={() => setOperation("delete")}>Xoá vì vi phạm</Button>
    </div>
    {operation && <Dialog title={operation === "delete" ? "Xoá tài khoản vi phạm?" : operation === "ban" ? "Ban tài khoản?" : "Bỏ ban tài khoản?"} close={close}>
      <p>{email ?? id}</p>
      {operation === "delete" && <p>Thao tác này xoá vĩnh viễn tài khoản và dữ liệu chung liên quan. Không thể khôi phục.</p>}
      {operation !== "unban" && <>
        <label>Loại vi phạm
          <select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}>
            {reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Lý do cụ thể (10–500 ký tự)
          <textarea value={note} minLength={10} maxLength={500} onChange={(event) => setNote(event.target.value)} />
        </label>
      </>}
      {operation === "delete" && <label>Nhập “XOÁ TÀI KHOẢN” để xác nhận
        <input value={confirmation} autoComplete="off" onChange={(event) => setConfirmation(event.target.value)} />
      </label>}
      <Notice error={error} />
      <div className="button-row">
        <Button className="button-secondary" disabled={busy} onClick={close}>Huỷ</Button>
        <Button className={operation === "delete" ? "button-danger" : "button-secondary"} busy={busy}
          disabled={operation !== "unban" && (note.trim().length < 10 || note.trim().length > 500) || operation === "delete" && confirmation !== "XOÁ TÀI KHOẢN"}
          onClick={async () => {
            setBusy(true); setError(undefined);
            try {
              await adminRequest("moderation", z.object({}), {
                id, operation, ...(operation === "unban" ? {} : { reason, note: note.trim() }),
                ...(operation === "delete" ? { confirmation } : {}),
              });
              setOperation(null); setNote(""); setConfirmation("");
              await cache.invalidateQueries({ queryKey: ["admin"] });
            } catch (caught) {
              setError(caught);
              await cache.invalidateQueries({ queryKey: ["admin", "accounts"] });
            }
            finally { setBusy(false); }
          }}>{operation === "delete" ? "Xác nhận xoá" : operation === "ban" ? "Xác nhận ban" : "Xác nhận bỏ ban"}</Button>
      </div>
    </Dialog>}
  </>;
}
