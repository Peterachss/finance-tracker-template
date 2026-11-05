"use client";

import type { ReactNode } from "react";
import { parseAmountInput } from "@/lib/parse";
import type { CollectionState } from "@/lib/collections";
import { Banner, Skeleton } from "@/components/ui";

/** The one card style used by the planning tabs (bill.com / Untitled UI). */
export const cardClass = "rounded-[16px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)]";

export function Card({ title, action, children, className = "" }: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${cardClass} ${className}`}>
      {title || action ? (
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-1 pt-5">
          {typeof title === "string" ? <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2> : title}
          {action}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Large figure with a caption underneath, as in the bill.com summary cards. */
export function Figure({ label, value, caption, tone }: {
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  tone?: "accent" | "negative" | "positive";
}) {
  const colour =
    tone === "negative" ? "text-[var(--negative)]" : tone === "positive" ? "text-[var(--positive)]" : "text-[var(--accent)]";
  return (
    <div className="min-w-0">
      <p className="text-[13px] text-[var(--text-muted)]">{label}</p>
      <p className={`tnum mt-1 whitespace-nowrap text-[20px] font-semibold tracking-[-0.02em] ${colour}`}>
        {value}
      </p>
      {caption ? <p className="mt-2 text-[12px] text-[var(--text-faint)]">{caption}</p> : null}
    </div>
  );
}

/** Loading / not-set-up / error states shared by every planning tab. */
export function CollectionGate({ states, errors, children }: {
  states: CollectionState[];
  errors: (string | null)[];
  children: ReactNode;
}) {
  if (states.includes("missing")) {
    return (
      <Banner tone="warning" title="One setup step left.">
        This tab needs its database tables. Apply <code>supabase/migrations/0004_planning_tables.sql</code> in the Supabase
        SQL editor (or ask Claude to apply it), then reload. Nothing else changes.
      </Banner>
    );
  }
  const failed = states.findIndex((s) => s === "error");
  if (failed >= 0) return <Banner tone="error" title="Could not load:">{errors[failed]}</Banner>;
  if (states.includes("loading")) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * Amount typed by a person: "45000", "45,000", "600k", "2tr", "2m", "6.6m".
 * k = thousand, tr/m = million (Vietnamese and English shorthand).
 */
export function parseMoney(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/\s/g, "");
  const short = /^(\d+(?:[.,]\d+)?)(k|tr|m|mil)$/.exec(text);
  if (short) {
    const value = Number(short[1].replace(",", "."));
    const factor = short[2] === "k" ? 1_000 : 1_000_000;
    const minor = Math.round(value * factor * 100);
    return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
  }
  const parsed = parseAmountInput(raw);
  if (!parsed.ok || parsed.value.minor <= 0) return null;
  return parsed.value.minor;
}

export const inputClass =
  "h-11 w-full rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 text-[14px] placeholder:text-[var(--text-faint)]";

export const primaryButton =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-[var(--accent)] px-4 text-[14px] font-medium text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50";

export const outlineButton =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-[var(--accent)] bg-[var(--surface)] px-4 text-[14px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)] disabled:opacity-50";

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}
