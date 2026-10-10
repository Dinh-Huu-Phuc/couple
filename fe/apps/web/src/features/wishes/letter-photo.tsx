"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ImageIcon, RefreshCw } from "lucide-react";
import { useApp } from "@/components/app-shell";
import { Dialog } from "@/components/ui";

export function LetterPhoto({
  storageKey,
  alt,
  className = "",
  bucket = "couple-letter-attachments",
}: {
  storageKey: string;
  alt: string;
  className?: string;
  bucket?: "couple-letter-attachments" | "couple-chat-attachments";
}) {
  const { client } = useApp();
  const [photo, setPhoto] = useState<{ key: string; url: string }>();
  const url = photo?.key === storageKey ? photo.url : undefined;
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    void client.storage
      .from(bucket)
      .download(storageKey)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) setFailed(true);
        else {
          objectUrl = URL.createObjectURL(data);
          setPhoto({ key: storageKey, url: objectUrl });
        }
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, storageKey, attempt, bucket]);

  if (!url)
    return (
      <div className={`letter-photo-state ${className}`}>
        {failed ? (
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RefreshCw size={18} /> Tải lại ảnh
          </button>
        ) : (
          <>
            <ImageIcon size={23} />
            <span>Đang mở ảnh…</span>
          </>
        )}
      </div>
    );

  return (
    <>
      <button
        type="button"
        className={`letter-photo letter-photo-open ${className}`}
        aria-label={`Xem ảnh lớn: ${alt}`}
        onClick={() => setExpanded(true)}
      >
        <Image unoptimized width={900} height={1100} src={url} alt={alt} />
      </button>
      {expanded && (
        <Dialog
          title="Bức ảnh của hai mình"
          className="letter-photo-dialog"
          close={() => setExpanded(false)}
        >
          <Image unoptimized width={1400} height={1400} src={url} alt={alt} />
        </Dialog>
      )}
    </>
  );
}
