import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const manifest = z.array(
  z.object({
    bucket: z.enum(["couple-letter-attachments", "couple-chat-attachments"]),
    name: z
      .string()
      .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/i),
  }),
);

export async function cleanAttachments(client: SupabaseClient) {
  const { data, error } = await client
    .schema("api")
    .rpc("list_attachment_cleanup");
  if (error) throw error;
  const files = manifest.parse(data);
  let completed = 0;
  for (const file of files) {
    const removed = await client.storage.from(file.bucket).remove([file.name]);
    if (removed.error) continue;
    const marked = await client
      .schema("api")
      .rpc("complete_attachment_cleanup", {
        p_bucket: file.bucket,
        p_name: file.name,
      });
    if (!marked.error) completed++;
  }
  return { completed, deferred: files.length - completed };
}
