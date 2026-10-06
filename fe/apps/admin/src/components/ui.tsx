"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const active = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      active?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="admin-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="dialog-heading">
        <h2 id="admin-dialog-title">{title}</h2>
        <button className="icon-button" aria-label="Đóng" onClick={close}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
import { LoaderCircle } from "lucide-react";
import { friendlyError } from "@couple/domain";

export function Button({
  children,
  busy,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className={`button ${className}`}
      aria-busy={busy || undefined}
    >
      {busy && <LoaderCircle className="spin" size={17} />} {children}
    </button>
  );
}
export function Notice({
  error,
  text,
  retry,
}: {
  error?: unknown;
  text?: string;
  retry?: () => void;
}) {
  if (!error && !text) return null;
  return (
    <div
      className={`notice ${error ? "notice-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {error ? friendlyError(error) : text}
      {retry && (
        <button className="text-button" onClick={retry}>
          Thử lại
        </button>
      )}
    </div>
  );
}
export function Loading({ text = "Đang mở dữ liệu…" }: { text?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={22} className="spin" />
      <p>{text}</p>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
