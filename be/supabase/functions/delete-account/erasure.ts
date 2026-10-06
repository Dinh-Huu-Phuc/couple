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
    const names: string[] = [];
    for (const file of job.files) {
      if (
        !file ||
        typeof file !== "object" ||
        file.bucket !== "couple-memories" ||
        typeof file.name !== "string" ||
        !file.name ||
        file.name.length > 1024
      )
        throw new Error("manifest");
      names.push(file.name);
    }
    stage = "storage";
    const unique = [...new Set(names)];
    for (let offset = 0; offset < unique.length; offset += 100)
      await port.removeFiles(
        "couple-memories",
        unique.slice(offset, offset + 100),
      );
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
