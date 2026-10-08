"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Heart, LoaderCircle, Mail, X } from "lucide-react";
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
export function Loading({
  text = "Đang mở khoảng riêng của hai mình…",
}: {
  text?: string;
}) {
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
export function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="icon-tile">
        <Mail size={28} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function Envelope({ small = false, opening = false }: { small?: boolean; opening?: boolean }) {
  return (
    <div
      className={`envelope-scene ${small ? "small" : ""} ${opening ? "opening" : ""}`}
      aria-hidden="true"
    >
      <div className="envelope-paper" />
      <div className="envelope">
        <div className="envelope-fold" />
        <div className="envelope-seal">
          <Heart size={23} strokeWidth={1.3} />
        </div>
      </div>
      <span className="petal petal-one" />
      <span className="petal petal-two" />
      <span className="envelope-caption">pour toi ♡</span>
    </div>
  );
}
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
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" aria-label="Đóng" onClick={close}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
