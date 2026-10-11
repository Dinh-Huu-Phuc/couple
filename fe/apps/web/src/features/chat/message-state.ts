import type { ChatMessage } from "@couple/domain";

export function mergeMessages(messages: ChatMessage[]) {
  const unique = new Map<string, ChatMessage>();
  for (const message of messages) unique.set(message.id, message);
  return [...unique.values()].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

export function receiptLabel(message: ChatMessage) {
  return message.read_at
    ? "Đã đọc"
    : message.delivered_at
      ? "Đã nhận"
      : "Đã gửi";
}
