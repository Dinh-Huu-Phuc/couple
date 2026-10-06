import {
  eraseAccount,
  type ErasurePort,
} from "../../../../../be/supabase/functions/delete-account/erasure";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export function inactivityErasurePort(client: SupabaseClient): ErasurePort {
  const rpc = async (name: string, args: Record<string, string>) => {
    const result = await client.schema("api").rpc(name, args);
    if (result.error) throw new Error("database");
    return result.data;
  };
  return {
    prepare: (userId) =>
      rpc("prepare_inactive_account_erasure", { p_user_id: userId }),
    removeFiles: async (bucket, names) => {
      const result = await client.storage.from(bucket).remove(names);
      if (result.error) throw new Error("storage");
    },
    markFilesRemoved: async (jobId) => {
      await rpc("mark_account_files_removed", { p_job_id: jobId });
    },
    deleteUser: async (userId) => {
      const result = await client.auth.admin.deleteUser(userId, false);
      if (result.error) throw new Error("auth");
    },
    userIsMissing: async (userId) => {
      const result = await client.auth.admin.getUserById(userId);
      return !result.data.user && result.error?.status === 404;
    },
    recordFailure: async (jobId, stage) => {
      await rpc("account_erasure_failed", { p_job_id: jobId, p_stage: stage });
    },
  };
}
export async function cleanInactiveAccounts(client: SupabaseClient) {
  const result = await client.schema("api").rpc("inactive_account_candidates");
  if (result.error) throw new Error("database");
  const ids = z.array(z.uuid()).max(20).parse(result.data);
  let completed = 0;
  for (const id of ids)
    if (await eraseAccount(inactivityErasurePort(client), id)) completed++;
  return { checked: ids.length, completed, deferred: ids.length - completed };
}
export { eraseAccount };
