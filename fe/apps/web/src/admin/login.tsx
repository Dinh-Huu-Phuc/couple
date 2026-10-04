"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { adminRequest } from "./client";
import { Button, Notice } from "@/components/ui";
import styles from "./dashboard.module.css";
export function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const lock = useRef(false);
  const router = useRouter();
  const cache = useQueryClient();
  return (
    <main className={styles.loginShell}>
      <section className={`panel ${styles.loginCard}`}>
        <span className="wordmark">COUPLE · ADMIN</span>
        <h1>Đăng nhập quản trị.</h1>
        <p>Nhập tài khoản quản trị để mở khu vực dữ liệu đã xoá.</p>
        <form
          className="form-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError(undefined);
            try {
              await adminRequest("login", z.object({}), { username, password });
              setPassword("");
              cache.removeQueries({ queryKey: ["admin"] });
              router.refresh();
            } catch (error) {
              setError(error);
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          <label>
            Tên đăng nhập admin
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoComplete="username"
              maxLength={100}
            />
          </label>
          <label>
            Mật khẩu admin
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              maxLength={1024}
            />
          </label>
          <Notice error={error} />
          <Button type="submit" busy={busy}>
            Vào trang quản trị
          </Button>
        </form>
        <a href="/login" className="text-button">
          Về COUPLE
        </a>
      </section>
    </main>
  );
}
