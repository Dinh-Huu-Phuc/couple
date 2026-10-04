import { z } from "zod";

export const categories = {
  food: "Ăn uống",
  gift: "Quà tặng",
  date: "Hẹn hò",
  care: "Quan tâm",
  experience: "Trải nghiệm",
  other: "Khác",
} as const;
export const categorySchema = z.enum([
  "food",
  "gift",
  "date",
  "care",
  "experience",
  "other",
]);
export type Category = z.infer<typeof categorySchema>;
export const wishStatusLabels = {
  active: "Đang mở",
  paused: "Tạm ẩn",
  fulfilled: "Đã thực hiện",
  archived: "Đã lưu trữ",
} as const;
export const drawStatusLabels = {
  opened: "Vừa mở",
  accepted: "Để mình lo",
  discuss: "Cùng bàn nhé",
  deferred: "Để dịp khác",
  completed: "Đã hoàn thành",
  cancelled: "Đã rút / ngắt kết nối",
} as const;
export const uuid = z.uuid();
const date = z.string();
export const personSchema = z.object({
  id: uuid,
  displayName: z.string().nullable(),
});
export const profileSchema = personSchema.extend({
  timezone: z.string(),
  createdAt: date,
  updatedAt: date,
});
export const contextSchema = z.object({
  profile: profileSchema,
  emailVerified: z.boolean(),
  connectionState: z.enum([
    "connected",
    "incoming_request",
    "outgoing_request",
    "unpaired",
  ]),
  couple: z
    .object({
      id: uuid,
      status: z.literal("active"),
      createdAt: date,
      partner: personSchema,
    })
    .nullable(),
  activeInvite: z.object({ id: uuid, expiresAt: date }).nullish(),
  pendingIncomingCount: z.number().optional(),
  pendingOutgoingCount: z.number().optional(),
  deletionPending: z.boolean().optional(),
});
export type Context = z.infer<typeof contextSchema>;
export const wishSchema = z.object({
  id: uuid,
  couple_id: uuid,
  author_id: uuid,
  title: z.string(),
  description: z.string(),
  category: categorySchema,
  budget_vnd: z.number().nullable(),
  status: z.enum(["active", "paused", "fulfilled", "archived"]),
  available_from: date.nullable(),
  expires_at: date.nullable(),
  eligible_after: date.nullable(),
  version: z.number(),
  created_at: date,
  updated_at: date,
});
export type Wish = z.infer<typeof wishSchema>;
export const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string(),
  description: z.string(),
  category: categorySchema,
  budgetVnd: z.number().nullable(),
  availableFrom: date.nullable(),
  expiresAt: date.nullable(),
  wishVersion: z.number(),
});
export const drawSchema = z.object({
  id: uuid,
  couple_id: uuid,
  wish_id: uuid,
  drawn_by: uuid,
  status: z.enum([
    "opened",
    "accepted",
    "discuss",
    "deferred",
    "completed",
    "cancelled",
  ]),
  snapshot: snapshotSchema,
  drawn_at: date,
  completed_at: date.nullable(),
  discussion_message: z.string(),
  discussion_at: date.nullable(),
  deferred_until: date.nullable(),
  resumed: z.boolean().optional(),
});
export type Draw = z.infer<typeof drawSchema>;
export const discussionInputSchema = z
  .string()
  .trim()
  .min(1, "Cậu viết một lời nhắn trước khi gửi nhé.")
  .max(1000, "Lời nhắn tối đa 1.000 ký tự.");
export const deferTimeSchema = z.iso
  .datetime({ offset: true })
  .refine(
    (value) => new Date(value).getTime() > Date.now(),
    "Cậu chọn ngày giờ trong tương lai nhé.",
  );
export const memorySchema = z.object({
  id: uuid,
  draw_id: uuid,
  created_by: uuid,
  message: z.string(),
  photo_storage_key: z.string().nullable(),
  created_at: date,
  updated_at: date,
  draws: z.object({ snapshot: snapshotSchema, couple_id: uuid }).optional(),
});
export type Memory = z.infer<typeof memorySchema>;
export const requestSchema = z.object({
  id: uuid,
  status: z.enum([
    "pending",
    "accepted",
    "rejected",
    "cancelled",
    "expired",
    "ended",
  ]),
  createdAt: date,
  endedAt: date.optional(),
  canDelete: z.boolean().optional(),
  requester: personSchema.optional(),
  inviter: personSchema.optional(),
});
export type ConnectionRequest = z.infer<typeof requestSchema>;
export const inviteSchema = z.object({
  inviteId: uuid,
  code: z.string(),
  expiresAt: date,
});
export const previewSchema = z.object({
  inviteId: uuid,
  inviter: personSchema,
  expiresAt: date,
});
export const wishInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Cậu thêm một tiêu đề nhé.")
      .max(120, "Tiêu đề tối đa 120 ký tự."),
    description: z.string().max(2000, "Mô tả tối đa 2.000 ký tự."),
    category: categorySchema,
    budgetVnd: z.number().int().min(0).max(1_000_000_000).nullable(),
    availableFrom: z.iso.datetime({ offset: true }).nullable(),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .superRefine((v, ctx) => {
    if (
      v.availableFrom &&
      v.expiresAt &&
      new Date(v.expiresAt) <= new Date(v.availableFrom)
    )
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Ngày kết thúc phải sau ngày bắt đầu.",
      });
    if (v.expiresAt && new Date(v.expiresAt).getTime() <= Date.now())
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Ngày kết thúc cần nằm trong tương lai.",
      });
  });
export type WishInput = z.infer<typeof wishInputSchema>;
export const photoSchema = z.object({
  type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z
    .number()
    .min(1)
    .max(5 * 1024 * 1024),
});
export function safeNext(value: string | null | undefined, fallback = "/home") {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f]/.test(value)
  )
    return fallback;
  return value;
}
export function initials(name: string | null | undefined) {
  return (
    name
      ?.trim()
      .split(/\s+/)
      .slice(-2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?"
  );
}
export function money(value: number | null) {
  return value === null
    ? "Chưa xác định ngân sách"
    : value === 0
      ? "Không tốn tiền"
      : new Intl.NumberFormat("vi-VN", {
          style: "currency",
          currency: "VND",
        }).format(value);
}
export function dateLabel(value: string, timezone = "Asia/Ho_Chi_Minh") {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
export function isOpenDraw(draw: Draw) {
  return ["opened", "accepted", "discuss"].includes(draw.status);
}

export const errorMessages: Record<string, string> = {
  ADMIN_INVALID_CREDENTIALS: "Tên đăng nhập hoặc mật khẩu admin chưa đúng.",
  ADMIN_RATE_LIMITED: "Đã nhập sai nhiều lần. Cậu chờ 15 phút rồi thử lại nhé.",
  ADMIN_SESSION_EXPIRED:
    "Phiên quản trị đã hết hạn. Cậu đăng nhập admin lại nhé.",
  ADMIN_UNAVAILABLE: "Chưa kết nối được khu vực quản trị. Cậu thử lại nhé.",
  REAUTH_REQUIRED: "Mật khẩu chưa đúng. Cậu xác nhận lại trước khi xoá nhé.",
  DELETION_RETRY_REQUIRED:
    "Việc lưu dữ liệu và xoá tài khoản chưa hoàn tất. Cậu bấm thử lại để tiếp tục; dữ liệu đã lưu sẽ được giữ.",
  UNAUTHENTICATED: "Phiên đăng nhập đã hết hạn. Cậu đăng nhập lại nhé.",
  EMAIL_NOT_VERIFIED: "Cậu cần xác nhận email trước khi kết nối.",
  VALIDATION_ERROR: "Một vài thông tin chưa hợp lệ. Cậu kiểm tra lại nhé.",
  PROFILE_INCOMPLETE: "Cậu đặt tên hiển thị trước nhé.",
  INVITE_INVALID_OR_EXPIRED: "Mã mời không hợp lệ hoặc đã hết hạn.",
  SELF_CONNECT: "Đây là mã của chính cậu. Hãy gửi mã cho người ấy nhé.",
  ALREADY_CONNECTED:
    "Một trong hai người đã có kết nối. Hãy làm mới để xem trạng thái hiện tại.",
  REQUEST_NOT_PENDING: "Yêu cầu này đã được xử lý.",
  NOT_ALLOWED:
    "Cậu không còn quyền thực hiện thao tác này. Hãy làm mới trạng thái.",
  COUPLE_ENDED: "Kết nối đã kết thúc. Nội dung chung không còn truy cập được.",
  EMPTY_POOL:
    "Hiện chưa có mong muốn phù hợp. Thử đổi bộ lọc hoặc quay lại sau.",
  WISH_BUSY:
    "Mong muốn đang có thẻ chưa xử lý. Cậu có thể rút mong muốn nếu cần.",
  STALE_VERSION: "Mong muốn đã thay đổi ở nơi khác. Hãy làm mới trước khi sửa.",
  INVALID_TRANSITION: "Trạng thái đã thay đổi. Hãy làm mới trước khi tiếp tục.",
  DISCUSSION_MESSAGE_REQUIRED:
    "Cậu viết một lời nhắn từ 1 đến 1.000 ký tự trước khi gửi nhé.",
  DEFER_TIME_REQUIRED: "Cậu cần chọn ngày giờ trước khi xác nhận để dịp khác.",
  DEFER_TIME_INVALID: "Cậu chọn ngày giờ trong tương lai nhé.",
  IDEMPOTENCY_CONFLICT:
    "Lần gửi lại có thông tin khác. Hãy làm mới trước khi tiếp tục.",
  INVITE_CODE_NOT_REPLAYABLE:
    "Mã vừa tạo không thể hiện lại. Cậu hãy chủ động tạo một mã mới.",
  DUPLICATE_REQUEST:
    "Cậu đã gửi yêu cầu cho mã này. Hãy nhờ người ấy tạo mã mới nếu muốn gửi lại.",
  WISH_LIMIT_REACHED: "Hộp có tối đa 200 mong muốn chưa lưu trữ.",
  PHOTO_NOT_FOUND: "Chưa tìm thấy ảnh đã tải lên. Cậu thử lưu lại nhé.",
  PHOTO_DECODE_ERROR:
    "Không đọc được ảnh này. Cậu chọn một ảnh JPEG, PNG hoặc WebP khác nhé.",
  NETWORK_ERROR:
    "Chưa kết nối được. Thông tin đang nhập vẫn được giữ, cậu thử lại nhé.",
  INVALID_RESPONSE: "Chưa đọc được phản hồi. Cậu thử làm mới nhé.",
  invalid_credentials: "Email hoặc mật khẩu chưa đúng.",
  email_not_confirmed: "Email chưa được xác nhận. Cậu kiểm tra hộp thư nhé.",
  user_already_exists: "Email này đã có tài khoản. Cậu đăng nhập nhé.",
  same_password: "Cậu chọn mật khẩu khác mật khẩu hiện tại nhé.",
  weak_password: "Mật khẩu cần ít nhất 8 ký tự.",
  over_email_send_rate_limit:
    "Email được gửi quá nhanh. Cậu chờ một chút rồi thử lại nhé.",
  otp_expired: "Liên kết đã hết hạn. Cậu yêu cầu gửi lại nhé.",
};
export class AppError extends Error {
  constructor(
    public code: string,
    public retryAfterSeconds?: number,
  ) {
    super(
      code === "RATE_LIMITED"
        ? `Cậu chờ ${retryAfterSeconds ?? 60} giây rồi thử lại nhé.`
        : (errorMessages[code] ?? "Thao tác chưa hoàn tất. Cậu thử lại nhé."),
    );
    this.name = "AppError";
  }
}
export function friendlyError(error: unknown) {
  if (error instanceof AppError) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  )
    return (
      errorMessages[error.code] ?? "Thao tác chưa hoàn tất. Cậu thử lại nhé."
    );
  return errorMessages.NETWORK_ERROR;
}
// Reuse a mutation key on transport failure; only an explicit new attempt or changed input gets a new key.
export class RequestKeys {
  private keys = new Map<string, string>();
  get(action: string, payload: unknown) {
    const key = JSON.stringify([action, payload]);
    if (!this.keys.has(key)) this.keys.set(key, crypto.randomUUID());
    return this.keys.get(key)!;
  }
  clear(action: string, payload: unknown) {
    this.keys.delete(JSON.stringify([action, payload]));
  }
}
