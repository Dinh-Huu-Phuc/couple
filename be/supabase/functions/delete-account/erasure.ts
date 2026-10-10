export type DeletionStage = "database" | "storage" | "auth";
export type ErasurePort = {
  prepare(userId: string): Promise<unknown>;
  removeFiles(bucket: string, names: string[]): Promise<void>;
  markFilesRemoved(jobId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  userIsMissing(userId: string): Promise<boolean>;
  recordFailure(jobId: string, stage: DeletionStage): Promise<void>;
};

// Storage, DB and Auth cannot share a transaction. Freeze/snapshot first, remove
// bytes with Storage API, verify the manifest, then commit the relational purge
// in the Auth deletion trigger. Repeated removal of the same paths is safe.
export async function eraseAccount(port: ErasurePort, userId: string) {
  let jobId: string | undefined;
  let stage: DeletionStage = "database";
  try {
    const prepared = await port.prepare(userId);
    if (!prepared || typeof prepared !== "object") throw new Error("manifest");
    const job = prepared as { id?: unknown; files?: unknown };
    if (
      typeof job.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(job.id) ||
      !Array.isArray(job.files)
    )
      throw new Error("manifest");
    jobId = job.id;
    const filesByBucket = new Map<string, string[]>();
    for (const file of job.files) {
      if (
        !file ||
        typeof file !== "object" ||
        !["couple-memories", "couple-letter-attachments", "couple-chat-attachments"].includes(file.bucket) ||
        typeof file.name !== "string" ||
        !file.name ||
        file.name.length > 1024
      )
        throw new Error("manifest");
      const names = filesByBucket.get(file.bucket) ?? [];
      names.push(file.name);
      filesByBucket.set(file.bucket, names);
    }
    stage = "storage";
    for (const [bucket, names] of filesByBucket) {
      const unique = [...new Set(names)];
      for (let offset = 0; offset < unique.length; offset += 100)
        await port.removeFiles(bucket, unique.slice(offset, offset + 100));
    }
    stage = "database";
    await port.markFilesRemoved(jobId);
    stage = "auth";
    try {
      await port.deleteUser(userId);
    } catch {
      if (!(await port.userIsMissing(userId))) throw new Error("auth deletion");
    }
    return true;
  } catch {
    if (jobId) {
      try {
        await port.recordFailure(jobId, stage);
      } catch {
        /* Retry remains possible. */
      }
    }
    return false;
  }
}
