"use client";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { AppError, memorySchema, photoSchema, type Draw, type Memory } from "@couple/domain";
import { useApp } from "@/components/app-shell";
import { Button, Dialog, Loading, Notice } from "@/components/ui";
import { useAction } from "@/lib/use-action";
import { cleanPhoto } from "@/lib/photo";
export function MemoryEditor({
  draw,
  close,
}: {
  draw: Draw;
  close: () => void;
}) {
  const { client, userId, context } = useApp();
  const savingRef = useRef(false);
  const query = useQuery({
    queryKey: [userId, context.couple?.id, "memory-editor", draw.id],
    queryFn: async () => {
      const { data, error } = await client
        .from("memories")
        .select(
          "id,draw_id,created_by,message,photo_storage_key,created_at,updated_at",
        )
        .eq("draw_id", draw.id)
        .maybeSingle();
      if (error) throw new AppError("NETWORK_ERROR");
      if (!data) return null;
      const parsed = memorySchema.safeParse(data);
      if (!parsed.success) throw new AppError("INVALID_RESPONSE");
      return parsed.data;
    },
  });
  return (
    <Dialog
      title="Giữ lại kỷ niệm này"
      close={() => {
        if (!savingRef.current) close();
      }}
    >
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Notice error={query.error} retry={() => void query.refetch()} />
      ) : (
        <MemoryForm
          draw={draw}
          memory={query.data ?? undefined}
          close={close}
          savingRef={savingRef}
        />
      )}
    </Dialog>
  );
}
function MemoryForm({
  draw,
  memory,
  close,
  savingRef,
}: {
  draw: Draw;
  memory?: Memory;
  close: () => void;
  savingRef: { current: boolean };
}) {
  const { client, api, userId } = useApp();
  const action = useAction();
  const [message, setMessage] = useState(memory?.message ?? "");
  const [file, setFile] = useState<File>();
  const [photoKey, setPhotoKey] = useState(memory?.photo_storage_key ?? null);
  const [validation, setValidation] = useState("");
  const uploaded = useRef<{ file: File; key: string } | undefined>(undefined);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setValidation("");
    if (!message.trim() && !file && !photoKey) {
      setValidation("Cậu thêm một lời nhắn hoặc một bức ảnh nhé.");
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      await action.run(async () => {
        let key = photoKey;
        if (file) {
          if (uploaded.current?.file === file) key = uploaded.current.key;
          else {
            const blob = await cleanPhoto(file);
            key = `${draw.couple_id}/${draw.id}/${userId}/${crypto.randomUUID()}.webp`;
            const { error } = await client.storage
              .from("couple-memories")
              .upload(key, blob, { contentType: "image/webp", upsert: false });
            if (error) throw new AppError("NETWORK_ERROR");
            uploaded.current = { file, key };
          }
        }
        return api.memory(draw.id, message, key);
      }, close);
    } finally {
      savingRef.current = false;
    }
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <p className="memory-draw-title">{draw.snapshot.title}</p>
      <label>
        Lời nhắn của cậu
        <textarea
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
          placeholder="Điều cậu muốn nhớ về khoảnh khắc này…"
        />
      </label>
      <span className="field-note">{message.length}/1.000 ký tự</span>
      <label>
        Một bức ảnh (không bắt buộc)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected && !photoSchema.safeParse(selected).success) {
              setValidation(
                "Ảnh cần là JPEG, PNG hoặc WebP và không quá 5 MiB.",
              );
              e.target.value = "";
              return;
            }
            setFile(selected);
            setValidation("");
          }}
        />
      </label>
      <p className="field-note">
        JPEG, PNG hoặc WebP · Tối đa 5 MiB. Ảnh được bỏ thông tin vị trí trước
        khi tải lên.
      </p>
      {photoKey && (
        <div className="button-row">
          <span className="muted">Đang có một ảnh trong kỷ niệm.</span>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setPhotoKey(null);
              setFile(undefined);
              uploaded.current = undefined;
            }}
          >
            Bỏ ảnh khỏi kỷ niệm
          </button>
        </div>
      )}
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
          Lưu kỷ niệm
        </Button>
      </div>
    </form>
  );
}
