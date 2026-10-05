"use client";
import { AppError } from "@couple/domain";
import { z } from "zod";
export async function adminRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok || !result?.ok) {
    if (result?.error?.code === "ADMIN_SESSION_EXPIRED")
      window.location.replace("/");
    throw new AppError(result?.error?.code ?? "ADMIN_UNAVAILABLE");
  }
  return schema.parse(result.data);
}
