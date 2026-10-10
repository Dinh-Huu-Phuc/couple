"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, MessageCircle, Send, X } from "lucide-react";
import Image from "next/image";
import { z } from "zod";
import {
  chatMessageInputSchema,
  chatMessageSchema,
  dateLabel,
  photoSchema,
  type ChatMessage,
} from "@couple/domain";
import { queryKeys } from "@couple/api";
import { useApp } from "@/components/app-shell";
import { Button, Empty, Loading, Notice, PageHeading } from "@/components/ui";
import { useAction } from "@/lib/use-action";
import { cleanPhoto } from "@/lib/photo";
import { LetterPhoto } from "@/features/wishes/letter-photo";

type ChatCursor = { at: string; id: string } | undefined;

export function ChatPage() {
  const { api, client, context, userId } = useApp();
  const cache = useQueryClient();
  const action = useAction();
  const [body, setBody] = useState("");
  const [validation, setValidation] = useState("");
  const [file, setFile] = useState<File>();
  const uploaded = useRef<{ file: File; key: string } | undefined>(undefined);
  const fileUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : undefined),
    [file],
  );
  useEffect(
    () => () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    },
    [fileUrl],
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const newestRef = useRef<string | undefined>(undefined);
  const coupleId = context.couple!.id;
  const key = useMemo(
    () => queryKeys.chat(userId, coupleId),
    [userId, coupleId],
  );
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as ChatCursor,
    queryFn: async ({ pageParam }) => {
      let request = client
        .from("chat_messages")
        .select("id,couple_id,sender_id,body,photo_storage_key,created_at")
        .eq("couple_id", coupleId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50);
      if (pageParam)
        request = request.or(
          `created_at.lt.${pageParam.at},and(created_at.eq.${pageParam.at},id.lt.${pageParam.id})`,
        );
      const { data, error } = await request;
      if (error) throw error;
      return z.array(chatMessageSchema).parse(data);
    },
    getNextPageParam: (last) =>
      last.length === 50
        ? { at: last.at(-1)!.created_at, id: last.at(-1)!.id }
        : undefined,
    refetchInterval: 15_000,
  });
  const messages = useMemo(
    () =>
      (query.data?.pages.flat() ?? [])
        .slice()
        .sort(
          (a, b) =>
            a.created_at.localeCompare(b.created_at) ||
            a.id.localeCompare(b.id),
        ),
    [query.data],
  );

  useEffect(() => {
    const channel = client
      .channel(`chat:${coupleId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `couple_id=eq.${coupleId}`,
        },
        () => void cache.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [cache, client, coupleId, key]);
  useEffect(() => {
    const newest = messages.at(-1)?.id;
    if (newest && newest !== newestRef.current)
      bottomRef.current?.scrollIntoView({
        behavior: "instant",
        block: "nearest",
      });
    newestRef.current = newest;
  }, [messages]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setValidation("");
    const parsed = chatMessageInputSchema.safeParse(body);
    if (!parsed.success) {
      setValidation(parsed.error.issues[0].message);
      return;
    }
    if (!parsed.data && !file) return;
    const sentFile = file;
    await action.run(
      async () => {
        let photoKey: string | null = null;
        if (sentFile) {
          if (uploaded.current?.file === sentFile)
            photoKey = uploaded.current.key;
          else {
            const blob = await cleanPhoto(sentFile);
            photoKey = `${coupleId}/${userId}/${crypto.randomUUID()}.webp`;
            const { error } = await client.storage
              .from("couple-chat-attachments")
              .upload(photoKey, blob, {
                contentType: "image/webp",
                upsert: false,
              });
            if (error) throw error;
            uploaded.current = { file: sentFile, key: photoKey };
          }
        }
        const payload = { body: parsed.data, photoKey };
        const result = await api.sendChatMessage(
          parsed.data,
          action.keys.get("chat", payload),
          photoKey,
        );
        action.keys.clear("chat", payload);
        return result;
      },
      async () => {
        setBody((current) => (current === body ? "" : current));
        setFile((current) => (current === sentFile ? undefined : current));
        uploaded.current = undefined;
        await cache.invalidateQueries({ queryKey: key });
      },
    );
  }

  return (
    <div className="chat-page">
      <PageHeading
        eyebrow="CHỈ HAI MÌNH ĐỌC ĐƯỢC"
        title="Trò chuyện cùng nhau."
        description="Tin nhắn được giữ trong kết nối hiện tại và tự động xoá khi hai người ngừng kết nối."
      />
      <section className="chat-panel" aria-label="Cuộc trò chuyện">
        <div className="chat-history">
          {query.hasNextPage && (
            <Button
              className="button-secondary chat-load-more"
              busy={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Xem tin nhắn cũ hơn
            </Button>
          )}
          <Notice error={query.error} retry={() => void query.refetch()} />
          {query.isPending ? (
            <Loading text="Đang mở cuộc trò chuyện…" />
          ) : messages.length === 0 ? (
            <Empty
              title="Cuộc trò chuyện đang đợi lời đầu tiên"
              text={`Gửi một lời nhỏ tới ${context.couple?.partner.displayName ?? "người ấy"}.`}
            />
          ) : (
            messages.map((message: ChatMessage) => {
              const mine = message.sender_id === userId;
              return (
                <article
                  key={message.id}
                  className={`chat-message ${mine ? "mine" : "theirs"}`}
                >
                  <span>
                    {mine ? "Cậu" : context.couple?.partner.displayName}
                  </span>
                  {message.photo_storage_key && (
                    <LetterPhoto
                      bucket="couple-chat-attachments"
                      storageKey={message.photo_storage_key}
                      alt="Ảnh gửi trong trò chuyện"
                    />
                  )}
                  {message.body && (
                    <p className="preserve-lines">{message.body}</p>
                  )}
                  <time dateTime={message.created_at}>
                    {dateLabel(message.created_at, context.profile.timezone)}
                  </time>
                </article>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
        {fileUrl && (
          <div className="chat-photo-preview">
            <Image
              unoptimized
              width={100}
              height={100}
              src={fileUrl}
              alt="Ảnh sắp gửi"
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Bỏ ảnh"
              disabled={action.busy}
              onClick={() => setFile(undefined)}
            >
              <X size={18} />
            </button>
          </div>
        )}
        <form className="chat-composer" onSubmit={send}>
          <label
            className="chat-photo-picker"
            aria-label="Chọn ảnh gửi trong chat"
          >
            <ImagePlus size={21} />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={action.busy}
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected && photoSchema.safeParse(selected).success) {
                  setFile(selected);
                  setValidation("");
                } else if (selected)
                  setValidation(
                    "Ảnh cần là JPEG, PNG hoặc WebP, tối đa 5 MiB.",
                  );
                event.target.value = "";
              }}
            />
          </label>
          <label>
            <span className="sr-only">Tin nhắn</span>
            <textarea
              rows={2}
              maxLength={2000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Nhắn điều cậu đang nghĩ…"
            />
          </label>
          <Button
            type="submit"
            busy={action.busy}
            disabled={!body.trim() && !file}
            aria-label="Gửi tin nhắn"
          >
            <Send size={18} />
          </Button>
        </form>
        <div className="chat-status">
          <MessageCircle size={14} />
          Enter để gửi · Shift + Enter để xuống dòng
        </div>
        <Notice text={validation} />
        <Notice error={action.error} />
      </section>
    </div>
  );
}
