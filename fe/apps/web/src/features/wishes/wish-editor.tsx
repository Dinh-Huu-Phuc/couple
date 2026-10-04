"use client";
import { useState } from "react";
import {
  categories,
  wishInputSchema,
  type Category,
  type Wish,
} from "@couple/domain";
import { useApp } from "@/components/app-shell";
import { Button, Dialog, Notice } from "@/components/ui";
import { useAction } from "@/lib/use-action";
function localDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
export function WishEditor({
  wish,
  close,
}: {
  wish?: Wish;
  close: () => void;
}) {
  const { api } = useApp();
  const action = useAction();
  const [title, setTitle] = useState(wish?.title ?? "");
  const [description, setDescription] = useState(wish?.description ?? "");
  const [category, setCategory] = useState<Category>(wish?.category ?? "care");
  const [budget, setBudget] = useState(wish?.budget_vnd?.toString() ?? "");
  const [from, setFrom] = useState(localDate(wish?.available_from ?? null));
  const [until, setUntil] = useState(localDate(wish?.expires_at ?? null));
  const [validation, setValidation] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setValidation("");
    const parsed = wishInputSchema.safeParse({
      title,
      description,
      category,
      budgetVnd: budget === "" ? null : Number(budget),
      availableFrom: from ? new Date(from).toISOString() : null,
      expiresAt: until ? new Date(until).toISOString() : null,
    });
    if (!parsed.success) {
      setValidation(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    await action.run(
      () =>
        wish
          ? api.updateWish(wish.id, wish.version, parsed.data)
          : api.createWish(parsed.data, action.keys.get("wish", parsed.data)),
      () => {
        action.keys.clear("wish", parsed.data);
        close();
      },
    );
  }
  return (
    <Dialog
      title={wish ? "Chỉnh lại lá thư" : "Viết một mong muốn"}
      close={() => {
        if (!action.busy) close();
      }}
    >
      <p className="muted">Người ấy chỉ đọc được khi mở được thẻ này.</p>
      <form className="form-stack" onSubmit={submit}>
        <label>
          Tiêu đề
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
            placeholder="Tớ muốn một buổi chiều đi dạo cùng cậu"
          />
        </label>
        <label>
          Lời nhắn
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="Kể thêm một chút để người ấy hiểu cậu hơn…"
          />
        </label>
        <div className="form-grid">
          <label>
            Nhóm mong muốn
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {Object.entries(categories).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ngân sách (VND)
            <input
              type="number"
              min={0}
              max={1000000000}
              step={1}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="Để trống nếu chưa biết"
            />
          </label>
        </div>
        <p className="field-note">
          0 đồng là không tốn tiền. Để trống là chưa xác định ngân sách.
        </p>
        <details>
          <summary>Thời gian phù hợp (không bắt buộc)</summary>
          <p className="field-note">
            Nhập theo giờ trên thiết bị của cậu. Ngày kết thúc chỉ ảnh hưởng
            lượt bốc mới.
          </p>
          <div className="form-grid">
            <label>
              Có thể bắt đầu
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Đến trước
              <input
                type="datetime-local"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </label>
          </div>
        </details>
        <Notice text={validation} />
        <Notice error={action.error} />
        <div className="button-row">
          <Button
            type="button"
            className="button-secondary"
            disabled={action.busy}
            onClick={close}
          >
            Để sau
          </Button>
          <Button type="submit" busy={action.busy}>
            {wish ? "Lưu thay đổi" : "Gửi vào hộp của tớ"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
