"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/**
 * Shared primitives.
 *
 * Surfaces are flat and separated by hairlines. A bordered box is used only
 * where it groups something genuinely separate; lists and sections use rules
 * instead, so the page does not read as a stack of floating cards.
 *
 * Radius scale: panels 12px, controls 8px. One scale, used consistently.
 */
const RADIUS = { panel: "rounded-[12px]", control: "rounded-[8px]" };

/** Pastel series for charts and category breakdowns. Green family only. */
export const SERIES = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
  "var(--color-series-5)",
  "var(--color-series-6)",
  "var(--color-series-7)",
  "var(--color-series-8)",
];

export function Panel({ title, action, children, className = "", bodyClassName = "" }: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`${RADIUS.panel} border border-[var(--line)] bg-[var(--surface)] ${className}`}>
      {title || action ? (
        <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-3.5">
          {typeof title === "string" ? <h2 className="text-[13px] font-medium text-[var(--text)]">{title}</h2> : title}
          {action}
        </header>
      ) : null}
      <div className={`px-4 pb-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({ variant = "outline", size = "md", className = "", ...props }: ButtonProps) {
  const sizes = size === "sm" ? "min-h-8 px-2.5 text-[13px]" : "min-h-10 px-3.5 text-sm";
  const variants = {
    primary: "bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)]",
    outline: "border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--accent-soft)] hover:border-[var(--accent)]",
    ghost: "text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text)]",
    danger: "border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--negative)] hover:bg-[var(--danger-soft)]",
  }[variant];

  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-40 ${sizes} ${RADIUS.control} ${variants} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, hint, children, htmlFor, error }: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-[var(--text-muted)]">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-[var(--negative)]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[var(--text-faint)]">{hint}</p>
      ) : null}
    </div>
  );
}

const controlClass =
  `w-full min-h-10 ${RADIUS.control} border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] transition-colors hover:border-[var(--text-faint)]`;

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${controlClass} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${controlClass} pr-7 ${className}`} {...props} />;
}

export function Banner({ tone = "info", title, children, action }: {
  tone?: "info" | "error" | "warning" | "success";
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    info: "border-[var(--line)] bg-[var(--surface)] text-[var(--text-muted)]",
    error: "border-[var(--negative)] bg-[var(--danger-soft)] text-[var(--negative)]",
    warning: "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]",
    success: "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]",
  }[tone];

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex flex-wrap items-center justify-between gap-2 ${RADIUS.control} border px-3 py-2 text-xs leading-relaxed ${tones}`}
    >
      <span>
        {title ? <strong className="font-medium">{title} </strong> : null}
        {children}
      </span>
      {action}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-6 py-12 text-center">
      <p className="text-sm font-medium text-[var(--text)]">{title}</p>
      {children ? <div className="max-w-sm text-sm leading-relaxed text-[var(--text-muted)]">{children}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[8px] bg-[var(--accent-soft)] ${className}`} />;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]">
      <span className="size-3.5 animate-spin rounded-full border-2 border-[var(--line-strong)] border-t-[var(--accent)]" />
      {label}
    </span>
  );
}

export function Modal({ open, onClose, title, children, footer }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgb(28_38_34_/_0.45)] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden ${RADIUS.panel} bg-[var(--surface)] shadow-[var(--shadow-pop)]`}>
        <header className="flex shrink-0 items-center justify-between px-4 py-3">
          <h2 className="text-sm font-medium">{title}</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </header>
        <div className="flex-1 overflow-auto px-4 pb-4">{children}</div>
        {footer ? (
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--line)] px-4 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-[var(--text-muted)]">{message}</div>
    </Modal>
  );
}

/**
 * The headline figure. Restrained by design: large enough to be the focal
 * point, not a hero banner.
 */
export function HeroFigure({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="tnum mt-1.5 text-[28px] font-medium leading-none tracking-tight sm:text-[32px]">{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

/** `tone` is for totals. Colouring every row turns colour into noise. */
export function Stat({ label, value, hint, tone }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass = {
    default: "",
    positive: "text-[var(--positive)]",
    negative: "text-[var(--negative)]",
  }[tone ?? "default"];

  return (
    <div className="min-w-0">
      <p className="label">{label}</p>
      <p className={`tnum mt-1.5 truncate text-xl font-medium tracking-tight ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

/** Label/value row for lists, where a card would be excessive. */
export function DataRow({ label, value, tone }: {
  label: ReactNode;
  value: ReactNode;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass = {
    default: "",
    positive: "text-[var(--positive)]",
    negative: "text-[var(--negative)]",
  }[tone ?? "default"];

  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="min-w-0 truncate text-sm text-[var(--text-muted)]">{label}</span>
      <span className={`tnum shrink-0 text-sm font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}