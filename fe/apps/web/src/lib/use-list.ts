"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { z } from "zod";
import { listRows, queryKeys, type Cursor } from "@couple/api";
import { AppError, drawSchema, memorySchema, wishSchema } from "@couple/domain";
import { useApp } from "@/components/app-shell";
export function useWishes(status: string, includePrevious = false) {
  const { userId, context, client } = useApp();
  const couple = includePrevious ? null : (context.couple?.id ?? null);
  return useInfiniteQuery({
    queryKey: queryKeys.wishes(userId, couple, status),
    initialPageParam: undefined as Cursor,
    queryFn: async ({ pageParam }) => {
      const result = z
        .array(wishSchema)
        .safeParse(
          await listRows(client, "wishes", userId, couple, pageParam, status),
        );
      if (!result.success) throw new AppError("INVALID_RESPONSE");
      return result.data;
    },
    getNextPageParam: (last) =>
      last.length === 20
        ? { at: last.at(-1)!.created_at, id: last.at(-1)!.id }
        : undefined,
  });
}
export function useDraws() {
  const { userId, context, client } = useApp();
  const couple = context.couple?.id ?? "";
  return useInfiniteQuery({
    queryKey: queryKeys.draws(userId, couple),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    initialPageParam: undefined as Cursor,
    enabled: !!couple,
    queryFn: async ({ pageParam }) => {
      const result = z
        .array(drawSchema)
        .safeParse(await listRows(client, "draws", userId, couple, pageParam));
      if (!result.success) throw new AppError("INVALID_RESPONSE");
      return result.data;
    },
    getNextPageParam: (last) =>
      last.length === 20
        ? { at: last.at(-1)!.drawn_at, id: last.at(-1)!.id }
        : undefined,
  });
}
export function useMemories() {
  const { userId, context, client } = useApp();
  const couple = context.couple?.id ?? "";
  return useInfiniteQuery({
    queryKey: queryKeys.memories(userId, couple),
    initialPageParam: undefined as Cursor,
    enabled: !!couple,
    queryFn: async ({ pageParam }) => {
      const result = z
        .array(memorySchema)
        .safeParse(
          await listRows(client, "memories", userId, couple, pageParam),
        );
      if (!result.success) throw new AppError("INVALID_RESPONSE");
      return result.data;
    },
    getNextPageParam: (last) =>
      last.length === 20
        ? { at: last.at(-1)!.created_at, id: last.at(-1)!.id }
        : undefined,
  });
}
