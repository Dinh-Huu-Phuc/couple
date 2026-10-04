"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Heart, ImageIcon } from "lucide-react";
import { dateLabel, type Memory } from "@couple/domain";
import { useApp } from "@/components/app-shell";
import { Button } from "@/components/ui";
export function MemoryCard({ memory }: { memory: Memory }) {
  const { client, context } = useApp();
  const [photo, setPhoto] = useState<{ key: string; url: string }>();
  const url = photo?.key === memory.photo_storage_key ? photo.url : undefined;
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const key = memory.photo_storage_key;
    if (!key) return;
    void client.storage
      .from("couple-memories")
      .download(key)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) setFailed(true);
        else {
          objectUrl = URL.createObjectURL(data);
          setPhoto({ key, url: objectUrl });
          setFailed(false);
        }
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, memory.photo_storage_key, attempt]);
  return (
    <article className="memory-card">
      {memory.photo_storage_key ? (
        url ? (
          <div className="memory-photo">
            {/* Blob URL requires an authenticated download and is revoked on unmount. */}
            <Image
              unoptimized
              width={800}
              height={600}
              src={url}
              alt={`Kỷ niệm: ${memory.draws?.snapshot.title ?? "của hai mình"}`}
              loading="lazy"
            />
          </div>
        ) : (
          <div className="memory-photo-placeholder">
            <ImageIcon size={25} />
            {failed ? (
              <Button
                className="button-secondary"
                onClick={() => setAttempt((v) => v + 1)}
              >
                Tải lại ảnh
              </Button>
            ) : (
              <span>Đang mở ảnh…</span>
            )}
          </div>
        )
      ) : (
        <div className="memory-text-art" aria-hidden="true">
          <Heart size={31} strokeWidth={1} />
          <span>một điều muốn nhớ</span>
        </div>
      )}
      <div className="memory-content">
        <time>{dateLabel(memory.created_at, context.profile.timezone)}</time>
        <h3>{memory.draws?.snapshot.title ?? "Kỷ niệm của hai mình"}</h3>
        <p className="preserve-lines">{memory.message}</p>
      </div>
    </article>
  );
}
