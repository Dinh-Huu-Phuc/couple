"use client";
import { useRef, useState } from "react";
import { RequestKeys } from "@couple/domain";
import { useApp } from "@/components/app-shell";
export function useAction() {
  const { refresh } = useApp();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<unknown>();
  const [message, setMessage] = useState("");
  const [keys] = useState(() => new RequestKeys());
  async function run<T>(
    work: () => Promise<T>,
    success?: (result: T) => void | Promise<void>,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    setMessage("");
    try {
      const result = await work();
      await success?.(result);
      await refresh();
      return result;
    } catch (e) {
      setError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { run, busy, error, message, setMessage, keys };
}
