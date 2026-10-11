"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { ImagePlus, Send, X } from "lucide-react";
import Image from "next/image";
import { z } from "zod";
import {
  chatMessageInputSchema,
  chatMessageSchema,
  dateLabel,
  photoSchema,
  type ChatMessage,
} from "@couple/domain";
import { coupleApi, queryKeys } from "@couple/api";
import { useApp } from "@/components/app-shell";
import { Button, Empty, Loading, Notice, PageHeading } from "@/components/ui";
import { cleanPhoto } from "@/lib/photo";
import { LetterPhoto } from "@/features/wishes/letter-photo";
import { mergeMessages, receiptLabel } from "./message-state";

type ChatCursor = { at: string; id: string } | undefined;
type Outgoing = {
  message: ChatMessage;
  photo?: Promise<Blob>;
  url?: string;
  key?: string;
  error?: unknown;
  busy: boolean;
};
type Pages = InfiniteData<ChatMessage[], ChatCursor>;
function insertMessage(old: Pages | undefined, message: ChatMessage): Pages {
  if (!old) return { pages: [[message]], pageParams: [undefined] };
  if (old.pages.some((page) => page.some((row) => row.id === message.id)))
    return {
      ...old,
      pages: old.pages.map((page) =>
        page.map((row) => (row.id === message.id ? message : row)),
      ),
    };
  return {
    ...old,
    pages: old.pages.map((page, index) =>
      index === 0
        ? mergeMessages([
            ...page.filter((m) => m.id !== message.id),
            message,
          ]).reverse()
        : page.filter((m) => m.id !== message.id),
    ),
  };
}
export function ChatPage() {
  const { client, context, userId } = useApp();
  const api = useMemo(() => coupleApi(client), [client]);
  const cache = useQueryClient();
  const coupleId = context.couple!.id;
  const key = useMemo(
    () => queryKeys.chat(userId, coupleId),
    [userId, coupleId],
  );
  const [body, setBody] = useState("");
  const [validation, setValidation] = useState("");
  const [photo, setPhoto] = useState<{ url: string; blob: Promise<Blob> }>();
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const [newMessages, setNewMessages] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const newestRef = useRef<string | undefined>(undefined);
  const queue = useRef(Promise.resolve());
  const delivered = useRef(new Set<string>());
  const read = useRef(new Set<string>());
  const urls = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const localUrls = urls.current;
    return () => {
      alive.current = false;
      for (const url of localUrls) URL.revokeObjectURL(url);
    };
  }, []);
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as ChatCursor,
    queryFn: async ({ pageParam }) => {
      let request = client
        .from("chat_messages")
        .select(
          "id,couple_id,sender_id,request_id,body,photo_storage_key,created_at,delivered_at,read_at",
        )
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
      last.length >= 50
        ? { at: last.at(-1)!.created_at, id: last.at(-1)!.id }
        : undefined,
    refetchInterval: 15_000,
  });
  const messages = useMemo(
    () => mergeMessages(query.data?.pages.flat() ?? []),
    [query.data],
  );
  const pending = outgoing.filter(
    (item) => !messages.some((m) => m.request_id === item.message.request_id),
  );
  useEffect(() => {
    const channel = client
      .channel(`chat:${coupleId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `couple_id=eq.${coupleId}`,
        },
        (payload) => {
          const result = chatMessageSchema.safeParse(payload.new);
          if (result.success)
            cache.setQueryData<Pages>(key, (old) =>
              insertMessage(old, result.data),
            );
          else void cache.invalidateQueries({ queryKey: key });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED")
          void cache.invalidateQueries({ queryKey: key });
      });
    return () => {
      void client.removeChannel(channel);
    };
  }, [cache, client, coupleId, key]);
  useEffect(() => {
    const newest = pending.at(-1)?.message.id ?? messages.at(-1)?.id;
    const history = bottomRef.current?.parentElement;
    const nearBottom =
      !history ||
      history.scrollHeight - history.scrollTop - history.clientHeight < 180;
    if (newest && newest !== newestRef.current) {
      if (
        nearBottom ||
        pending.length > 0 ||
        messages.at(-1)?.sender_id === userId ||
        !newestRef.current
      )
        bottomRef.current?.scrollIntoView({
          behavior: "instant",
          block: "nearest",
        });
      else setNewMessages(true);
    }
    newestRef.current = newest;
  }, [messages, pending, userId]);
  useEffect(() => {
    const ids = messages
      .filter(
        (m) =>
          m.sender_id !== userId &&
          !m.delivered_at &&
          !delivered.current.has(m.id),
      )
      .map((m) => m.id);
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      batch.forEach((id) => delivered.current.add(id));
      void api
        .ackChatMessages(batch)
        .catch(() => batch.forEach((id) => delivered.current.delete(id)));
    }
  }, [messages, userId, api]);
  useEffect(() => {
    const root = bottomRef.current?.parentElement;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (document.visibilityState !== "visible" || !document.hasFocus())
          return;
        const ids = entries
          .filter(
            (entry) =>
              entry.isIntersecting &&
              entry.boundingClientRect.bottom > 0 &&
              entry.boundingClientRect.top < window.innerHeight,
          )
          .map((entry) => (entry.target as HTMLElement).dataset.messageId!)
          .filter((id) => !read.current.has(id));
        ids.forEach((id) => read.current.add(id));
        for (let i = 0; i < ids.length; i += 100) {
          const batch = ids.slice(i, i + 100);
          void api
            .ackChatMessages(batch, true)
            .catch(() => batch.forEach((id) => read.current.delete(id)));
        }
      },
      { root, threshold: 0.1 },
    );
    const observe = () => {
      observer.disconnect();
      if (document.visibilityState !== "visible") return;
      root
        .querySelectorAll("[data-unread='true']")
        .forEach((element) => observer.observe(element));
    };
    observe();
    document.addEventListener("visibilitychange", observe);
    window.addEventListener("focus", observe);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", observe);
      window.removeEventListener("focus", observe);
    };
  }, [messages, userId, api]);
  async function transmit(item: Outgoing) {
    if (!alive.current) return;
    setOutgoing((old) =>
      old.map((row) =>
        row.message.id === item.message.id
          ? { ...row, busy: true, error: undefined }
          : row,
      ),
    );
    try {
      if (item.photo && !item.key) {
        const blob = await item.photo;
        item.key = `${coupleId}/${userId}/${crypto.randomUUID()}.webp`;
        const { error } = await client.storage
          .from("couple-chat-attachments")
          .upload(item.key, blob, { contentType: "image/webp", upsert: false });
        if (error) {
          item.key = undefined;
          throw error;
        }
      }
      const message = await api.sendChatMessage(
        item.message.body,
        item.message.request_id!,
        item.key ?? null,
        coupleId,
      );
      if (!alive.current) return;
      cache.setQueryData<Pages>(key, (old) => insertMessage(old, message));
      setOutgoing((old) =>
        old.filter((row) => row.message.id !== item.message.id),
      );
      if (item.url) {
        URL.revokeObjectURL(item.url);
        urls.current.delete(item.url);
      }
    } catch (error) {
      if (alive.current)
        setOutgoing((old) =>
          old.map((row) =>
            row.message.id === item.message.id
              ? { ...item, busy: false, error }
              : row,
          ),
        );
    }
  }
  function schedule(item: Outgoing) {
    if (item.photo) void transmit(item);
    else queue.current = queue.current.then(() => transmit(item));
  }
  function send(event: React.FormEvent) {
    event.preventDefault();
    setValidation("");
    const parsed = chatMessageInputSchema.safeParse(body);
    if (!parsed.success) {
      setValidation(parsed.error.issues[0].message);
      return;
    }
    if (!parsed.data && !photo) return;
    const id = crypto.randomUUID();
    const item: Outgoing = {
      message: {
        id,
        request_id: id,
        couple_id: coupleId,
        sender_id: userId,
        body: parsed.data,
        photo_storage_key: null,
        created_at: new Date().toISOString(),
      },
      photo: photo?.blob,
      url: photo?.url,
      busy: true,
    };
    setOutgoing((old) => [...old, item]);
    setBody("");
    setPhoto(undefined);
    textareaRef.current?.focus();
    schedule(item);
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
          ) : messages.length === 0 && pending.length === 0 ? (
            <Empty
              title="Cuộc trò chuyện đang đợi lời đầu tiên"
              text={`Gửi một lời nhỏ tới ${context.couple?.partner.displayName ?? "người ấy"}.`}
            />
          ) : (
            messages.map((message) => {
              const mine = message.sender_id === userId;
              return (
                <article
                  key={message.id}
                  className={`chat-message ${mine ? "mine" : "theirs"}`}
                  data-message-id={message.id}
                  data-unread={!mine && !message.read_at}
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
                  {mine && (
                    <details className="chat-receipt">
                      <summary>
                        {receiptLabel(message)}
                        {message.read_at &&
                          ` · ${dateLabel(message.read_at, context.profile.timezone)}`}
                      </summary>
                      <span>
                        Gửi:{" "}
                        {dateLabel(
                          message.created_at,
                          context.profile.timezone,
                        )}
                      </span>
                      {message.delivered_at && (
                        <span>
                          Nhận:{" "}
                          {dateLabel(
                            message.delivered_at,
                            context.profile.timezone,
                          )}
                        </span>
                      )}
                      {message.read_at && (
                        <span>
                          Đọc:{" "}
                          {dateLabel(message.read_at, context.profile.timezone)}
                        </span>
                      )}
                    </details>
                  )}
                </article>
              );
            })
          )}
          {pending.map((item) => (
            <article
              key={item.message.id}
              className="chat-message mine"
              aria-live="polite"
            >
              <span>Cậu</span>
              {item.url && (
                <Image
                  unoptimized
                  width={240}
                  height={180}
                  src={item.url}
                  alt="Ảnh đang gửi"
                />
              )}
              {item.message.body && (
                <p className="preserve-lines">{item.message.body}</p>
              )}
              {item.error ? (
                <>
                  <Notice error={item.error} />
                  <button
                    type="button"
                    onClick={() => schedule(item)}
                    disabled={item.busy}
                  >
                    Gửi thất bại · Thử lại
                  </button>
                </>
              ) : (
                <small>
                  {item.photo ? "Đang tải ảnh và gửi…" : "Đang gửi…"}
                </small>
              )}
            </article>
          ))}
          <div ref={bottomRef} />
        </div>
        {newMessages && (
          <Button
            className="button-secondary"
            onClick={() => {
              bottomRef.current?.scrollIntoView({ block: "nearest" });
              setNewMessages(false);
            }}
          >
            Có tin nhắn mới ↓
          </Button>
        )}
        {photo && (
          <div className="chat-photo-preview">
            <Image
              unoptimized
              width={100}
              height={100}
              src={photo.url}
              alt="Ảnh sắp gửi"
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Bỏ ảnh"
              onClick={() => {
                URL.revokeObjectURL(photo.url);
                urls.current.delete(photo.url);
                setPhoto(undefined);
              }}
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
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file && photoSchema.safeParse(file).success) {
                  if (photo) {
                    URL.revokeObjectURL(photo.url);
                    urls.current.delete(photo.url);
                  }
                  const url = URL.createObjectURL(file);
                  urls.current.add(url);
                  const blob = cleanPhoto(file);
                  void blob.catch(() => undefined);
                  setPhoto({ url, blob });
                  setValidation("");
                } else if (file)
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
              ref={textareaRef}
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
            disabled={!body.trim() && !photo}
            aria-label="Gửi tin nhắn"
          >
            <Send size={18} />
          </Button>
        </form>
        <div className="chat-status">
          Enter để gửi · Shift + Enter để xuống dòng
        </div>
        <Notice text={validation} />
      </section>
    </div>
  );
}
