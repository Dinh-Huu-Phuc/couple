"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Eye, ImagePlus, Save, Send, Trash2 } from "lucide-react";
import {
  categories,
  photoSchema,
  wishInputSchema,
  type Category,
  type LetterTemplate,
  type Wish,
} from "@couple/domain";
import { useApp } from "@/components/app-shell";
import { Button, Dialog, Loading, Notice } from "@/components/ui";
import { cleanPhoto } from "@/lib/photo";
import { useAction } from "@/lib/use-action";
import { LetterPhoto } from "./letter-photo";

const templates: Array<{ value: LetterTemplate; label: string }> = [
  { value: "cream", label: "Giấy kem" },
  { value: "rose", label: "Hồng dịu" },
  { value: "classic", label: "Cổ điển" },
];

function localDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

const draftSchema = z.object({
  title: z.string(),
  description: z.string(),
  greeting: z.string(),
  closing: z.string(),
  signature: z.string(),
  templateId: z.enum(["cream", "rose", "classic"]),
  photoStorageKey: z.string().nullable(),
  category: z.enum(["food", "gift", "date", "care", "experience", "other"]),
  budget: z.string(),
  from: z.string(),
  until: z.string(),
});
type Draft = z.infer<typeof draftSchema>;
export function LetterEditor({
  wish,
  close,
}: {
  wish?: Wish;
  close: () => void;
}) {
  const { client, userId, context } = useApp();
  const query = useQuery({
    queryKey: [userId, context.couple!.id, "letter-draft", wish?.id ?? "new"],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await client
        .from("letter_drafts")
        .select("payload")
        .eq("author_id", userId)
        .eq("couple_id", context.couple!.id)
        .eq("slot", wish?.id ?? "new")
        .maybeSingle();
      if (error) throw error;
      return data ? draftSchema.parse(data.payload) : null;
    },
  });
  if (query.isPending || query.isError)
    return (
      <Dialog title="Mở lá thư" close={close}>
        {query.isPending ? (
          <Loading text="Đang tìm bản nháp của cậu…" />
        ) : (
          <Notice error={query.error} retry={() => void query.refetch()} />
        )}
      </Dialog>
    );
  return (
    <LetterForm wish={wish} draft={query.data ?? undefined} close={close} />
  );
}
function LetterForm({
  wish,
  draft,
  close,
}: {
  wish?: Wish;
  draft?: Draft;
  close: () => void;
}) {
  const { api, client, context, userId } = useApp();
  const action = useAction();
  const [title, setTitle] = useState(draft?.title ?? wish?.title ?? "");
  const [description, setDescription] = useState(
    draft?.description ?? wish?.description ?? "",
  );
  const [greeting, setGreeting] = useState(
    draft?.greeting ?? wish?.greeting ?? "Gửi cậu thương,",
  );
  const [closing, setClosing] = useState(
    draft?.closing ?? wish?.closing ?? "Thương,",
  );
  const [signature, setSignature] = useState(
    draft?.signature ?? wish?.signature ?? context.profile.displayName ?? "",
  );
  const [templateId, setTemplateId] = useState<LetterTemplate>(
    draft?.templateId ?? wish?.template_id ?? "cream",
  );
  const [photoKey, setPhotoKey] = useState<string | null>(
    draft?.photoStorageKey ?? wish?.photo_storage_key ?? null,
  );
  const [file, setFile] = useState<File>();
  const [category, setCategory] = useState<Category>(
    draft?.category ?? wish?.category ?? "care",
  );
  const [budget, setBudget] = useState(
    draft?.budget ?? wish?.budget_vnd?.toString() ?? "",
  );
  const [from, setFrom] = useState(
    draft?.from ?? localDate(wish?.available_from ?? null),
  );
  const [until, setUntil] = useState(
    draft?.until ?? localDate(wish?.expires_at ?? null),
  );
  const [validation, setValidation] = useState("");
  const [preview, setPreview] = useState(false);
  const uploaded = useRef<{ file: File; key: string } | undefined>(undefined);
  const committed = useRef(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : undefined),
    [file],
  );
  const values = {
    title,
    description,
    greeting,
    closing,
    signature,
    templateId,
    photoStorageKey: photoKey,
    category,
    budget,
    from,
    until,
  };
  const [saved, setSaved] = useState(() => JSON.stringify(values));
  const dirty = Boolean(file) || JSON.stringify(values) !== saved;
  function requestClose() {
    if (
      !action.busy &&
      (!dirty ||
        window.confirm(
          "Lá thư có thay đổi chưa lưu. Cậu muốn đóng và bỏ các thay đổi này không?",
        ))
    )
      close();
  }

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const area = bodyRef.current;
    if (!area) return;
    const resize = () => {
      area.style.height = "auto";
      area.style.height = `${Math.max(220, area.scrollHeight)}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (area.parentElement) observer.observe(area.parentElement);
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) resize();
    });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [description, preview]);
  useEffect(
    () => () => {
      const pending = uploaded.current?.key;
      if (pending && !committed.current)
        void client.storage.from("couple-letter-attachments").remove([pending]);
    },
    [client],
  );

  function choosePhoto(selected?: File) {
    if (selected && !photoSchema.safeParse(selected).success) {
      setValidation("Ảnh cần là JPEG, PNG hoặc WebP và không quá 5 MiB.");
      return;
    }
    setFile(selected);
    setValidation("");
  }

  async function persist(saveDraft: boolean) {
    setValidation("");
    const captured = { ...values };
    if (!saveDraft) {
      const check = wishInputSchema.safeParse({
        ...values,
        budgetVnd: budget === "" ? null : Number(budget),
        availableFrom: from ? new Date(from).toISOString() : null,
        expiresAt: until ? new Date(until).toISOString() : null,
      });
      if (!check.success) {
        setValidation(check.error.issues.map((i) => i.message).join(" "));
        return;
      }
    }
    await action.run(async () => {
      let key = photoKey;
      if (file) {
        if (uploaded.current?.file === file) key = uploaded.current.key;
        else {
          const blob = await cleanPhoto(file);
          key = `${context.couple!.id}/${userId}/${crypto.randomUUID()}.webp`;
          const { error } = await client.storage
            .from("couple-letter-attachments")
            .upload(key, blob, { contentType: "image/webp", upsert: false });
          if (error) throw error;
          uploaded.current = { file, key };
        }
      }
      if (saveDraft) {
        await api.saveLetterDraft(wish?.id ?? "new", {
          ...captured,
          photoStorageKey: key,
        });
        committed.current = true;
        setPhotoKey(key);
        setFile(undefined);
        setSaved(JSON.stringify({ ...captured, photoStorageKey: key }));
        action.setMessage(
          "Đã lưu nháp riêng tư. Người ấy chưa thể bốc lá thư này.",
        );
        return;
      }
      const parsed = wishInputSchema.safeParse({
        title,
        description,
        greeting,
        closing,
        signature,
        templateId,
        photoStorageKey: key,
        category,
        budgetVnd: budget === "" ? null : Number(budget),
        availableFrom: from ? new Date(from).toISOString() : null,
        expiresAt: until ? new Date(until).toISOString() : null,
      });
      if (!parsed.success) {
        setValidation(
          parsed.error.issues.map((issue) => issue.message).join(" "),
        );
        return;
      }
      await (wish
        ? api.updateWish(wish.id, wish.version, parsed.data)
        : api.createWish(parsed.data, action.keys.get("wish", parsed.data)));
      committed.current = true;
      action.keys.clear("wish", parsed.data);
      close();
    });
  }

  return (
    <Dialog
      title={wish ? "Chỉnh lại lá thư" : "Viết một lá thư"}
      className="letter-editor-dialog"
      close={requestClose}
    >
      <form
        className="letter-editor"
        onSubmit={(event) => {
          event.preventDefault();
          void persist(false);
        }}
      >
        <fieldset disabled={action.busy} className="letter-fieldset">
          <div className="letter-toolbar">
            <label>
              Mẫu giấy
              <select
                value={templateId}
                onChange={(event) =>
                  setTemplateId(event.target.value as LetterTemplate)
                }
              >
                {templates.map((template) => (
                  <option key={template.value} value={template.value}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nhóm mong muốn
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as Category)
                }
              >
                {Object.entries(categories).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              className="button-secondary"
              onClick={() => setPreview((value) => !value)}
            >
              <Eye size={16} />
              {preview ? "Tiếp tục viết" : "Xem trước"}
            </Button>
          </div>

          <label className="letter-title-field">
            Tên mong muốn
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              required
              placeholder="Một buổi chiều đi dạo cùng cậu"
            />
          </label>

          <div
            className={`letter-compose ${photoKey || file || !preview ? "with-photo" : ""}`}
          >
            <section
              className={`letter-paper template-${templateId}`}
              aria-label="Giấy viết thư"
            >
              {preview ? (
                <>
                  <p className="letter-greeting">{greeting}</p>
                  <p className="letter-body preserve-lines">
                    {description || "Một điều nhỏ, dành cho nhau."}
                  </p>
                  <p className="letter-closing">{closing}</p>
                  <p className="letter-signature">{signature}</p>
                </>
              ) : (
                <>
                  <input
                    aria-label="Lời chào"
                    className="letter-line-input letter-greeting"
                    value={greeting}
                    onChange={(event) => setGreeting(event.target.value)}
                    maxLength={120}
                    placeholder="Gửi cậu thương,"
                  />
                  <textarea
                    ref={bodyRef}
                    aria-label="Nội dung lá thư"
                    className="letter-body-input"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={2000}
                    placeholder="Viết điều cậu muốn gửi tới người ấy…"
                  />
                  <input
                    aria-label="Lời kết"
                    className="letter-line-input letter-closing"
                    value={closing}
                    onChange={(event) => setClosing(event.target.value)}
                    maxLength={120}
                    placeholder="Thương,"
                  />
                  <input
                    aria-label="Chữ ký"
                    className="letter-line-input letter-signature"
                    value={signature}
                    onChange={(event) => setSignature(event.target.value)}
                    maxLength={80}
                    placeholder="Tên của cậu"
                  />
                </>
              )}
            </section>

            {(!preview || photoKey || file) && (
              <aside className="letter-attachment">
                {previewUrl ? (
                  <div className="letter-photo">
                    <Image
                      unoptimized
                      width={900}
                      height={1100}
                      src={previewUrl}
                      alt="Ảnh đính kèm đang chọn"
                    />
                  </div>
                ) : photoKey ? (
                  <LetterPhoto
                    storageKey={photoKey}
                    alt="Ảnh đính kèm lá thư"
                  />
                ) : (
                  <label className="letter-photo-picker">
                    <ImagePlus size={28} />
                    <strong>Thêm một bức ảnh</strong>
                    <span>Không bắt buộc</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => choosePhoto(event.target.files?.[0])}
                    />
                  </label>
                )}
                {(photoKey || file) && !preview && (
                  <div className="letter-photo-actions">
                    <label className="text-button">
                      <ImagePlus size={15} />
                      Thay ảnh
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) =>
                          choosePhoto(event.target.files?.[0])
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setFile(undefined);
                        setPhotoKey(null);
                      }}
                    >
                      <Trash2 size={15} />
                      Bỏ ảnh
                    </button>
                  </div>
                )}
              </aside>
            )}
          </div>

          <div className="letter-details form-grid">
            <label>
              Ngân sách (VND)
              <input
                type="number"
                min={0}
                max={1000000000}
                step={1}
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                placeholder="Để trống nếu chưa biết"
              />
            </label>
            <details>
              <summary>Thời gian phù hợp (không bắt buộc)</summary>
              <div className="form-grid">
                <label>
                  Có thể bắt đầu
                  <input
                    type="datetime-local"
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                  />
                </label>
                <label>
                  Đến trước
                  <input
                    type="datetime-local"
                    value={until}
                    onChange={(event) => setUntil(event.target.value)}
                  />
                </label>
              </div>
            </details>
          </div>
          <p className="field-note">
            {description.length}/2.000 ký tự · Ảnh được bỏ thông tin vị trí
            trước khi tải lên.
          </p>
          <Notice text={validation || action.message} />
          <Notice error={action.error} />
          <div className="button-row letter-editor-actions">
            <Button
              type="button"
              className="button-secondary"
              disabled={action.busy}
              onClick={() => void persist(true)}
            >
              <Save size={16} />
              Lưu nháp
            </Button>
            <Button type="submit" busy={action.busy}>
              <Send size={16} />
              {wish ? "Lưu thay đổi" : "Gửi vào hộp của tớ"}
            </Button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
