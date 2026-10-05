"use client";
import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { friendlyError } from "@couple/domain";

export function Button({ children, busy, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return <button {...props} disabled={busy || props.disabled} className={`button ${className}`} aria-busy={busy || undefined}>{busy && <LoaderCircle className="spin" size={17} />} {children}</button>;
}
export function Notice({ error, text, retry }: { error?: unknown; text?: string; retry?: () => void }) {
  if (!error && !text) return null;
  return <div className={`notice ${error ? "notice-error" : ""}`} role={error ? "alert" : "status"}>{error ? friendlyError(error) : text}{retry && <button className="text-button" onClick={retry}>Thử lại</button>}</div>;
}
export function Loading({ text = "Đang mở dữ liệu…" }: { text?: string }) {
  return <div className="loading" role="status"><LoaderCircle size={22} className="spin" /><p>{text}</p></div>;
}
export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</header>;
}
