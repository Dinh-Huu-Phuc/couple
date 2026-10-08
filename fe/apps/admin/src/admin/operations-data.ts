import { z } from "zod";

// Strip all fields outside the operations contract at the server boundary,
// including data returned by an old RPC during rollout.
export const deletionRowSchema = z.object({
  id: z.uuid(),
  status: z.enum(["pending", "files_ready", "completed"]),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  workflow: z.enum(["legacy", "erasure"]).default("legacy"),
  last_error: z.enum(["storage", "auth", "database"]).nullable().default(null),
  audit_expires_at: z.string().nullable().default(null),
});
export const operationsSchema = z.object({
  accounts: z.number().int().nonnegative(),
  activeCouples: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative().default(0),
  legacyRequests: z.number().int().nonnegative().default(0),
  legacyObjects: z.number().int().nonnegative(),
});
export const policySchema = z.object({
  days: z.number().int().min(1).max(3650),
  version: z.number().int().positive(),
});
export const activityRowSchema = z.object({
  activity_observed: z.boolean(),
  id: z.uuid(),
  email: z.string().nullable(),
  created_at: z.string(),
  last_seen_at: z.string(),
  inactive_days: z.number().int().nonnegative(),
  accepted: z.boolean(),
  eligible_at: z.string(),
  eligible: z.boolean(),
  deletion_pending: z.boolean(),
  banned: z.boolean().default(false),
  ban_reason: z.enum(["spam", "harassment", "abuse", "other"]).nullable().default(null),
  banned_at: z.string().nullable().default(null),
});
export const adminFeedbackSchema = z.object({
  id: z.uuid(),
  type: z.enum(["bug", "feature", "support"]),
  title: z.string(),
  body: z.string(),
  reply_email: z.string(),
  status: z.enum(["new", "reviewing", "resolved"]),
  admin_reply: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  reviewed_at: z.string().nullable(),
});
