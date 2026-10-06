import { z } from "zod";
import { browserClient } from "./supabase/client";

export const inactivityPolicySchema = z.object({
  days: z.number().int().min(1).max(3650),
  version: z.number().int().positive(),
});
export const inactivityStatusSchema = inactivityPolicySchema.extend({
  accepted: z.boolean(),
});
export async function inactivityPolicy() {
  const result = await browserClient().schema("api").rpc("inactivity_policy");
  if (result.error) throw result.error;
  return inactivityPolicySchema.parse(result.data);
}
export async function inactivityStatus() {
  const result = await browserClient()
    .schema("api")
    .rpc("my_inactivity_status");
  if (result.error) throw result.error;
  return inactivityStatusSchema.parse(result.data);
}
