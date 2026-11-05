"use client";

import type { ReactNode } from "react";
import { AppNav } from "@/components/nav";
import { QuickAdd } from "@/components/QuickAdd";
import { Banner, Spinner } from "@/components/ui";
import { DEMO_ENABLED } from "@/lib/demo";
import { useWorkspace } from "@/lib/store";

/**
 * App chrome: a compact sidebar on desktop, a top bar and bottom tab bar on
 * mobile (on the Nixtio mint wash). Main content is inset by the sidebar width so nothing sits under it.
 *
 * `wide` drops the centred max-width. The spreadsheet needs the full remaining
 * width because its grid is wider than a reading column; every other page keeps
 * a comfortable measure so text does not run edge to edge.
 */
export function AppShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { state, error, setupRequired, user, client, offline, pendingSync } = useWorkspace();

  if (setupRequired) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Banner tone="error" title="Supabase is not configured.">{error}</Banner>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Spinner label="Checking your session…" />
      </main>
    );
  }

  return (
    <div className="min-h-dvh max-md:overflow-x-hidden max-md:bg-gradient-to-b max-md:from-[var(--mint)] max-md:to-[var(--mint-2)] md:pl-[68px] 2xl:pl-[212px]">
      {/* First focusable element in the DOM, so the very first Tab skips the rail. */}
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <AppNav />
      <QuickAdd />
      {/* max() keeps the notch clear without leaving a gap on desktop. */}
      <main
        id="main"
        tabIndex={-1}
        className={`w-full px-4 pb-12 pt-[max(0.5rem,env(safe-area-inset-top))] md:pb-10 md:pt-[max(1.25rem,env(safe-area-inset-top))] ${
          wide ? "" : "mx-auto max-w-5xl"
        }`}
      >
        {DEMO_ENABLED ? (
          <p role="status" className="mb-4 rounded-[12px] bg-[var(--accent-soft)] px-4 py-2.5 text-[13px] text-[var(--accent)]">
            Try-it mode: no account needed. What you enter stays in this browser only.{" "}
            <a href="https://github.com/Peterachss/finance-tracker-template" className="font-medium underline underline-offset-2">Get your own copy</a>
          </p>
        ) : null}
        {offline || pendingSync > 0 ? (
          <p role="status" className="mb-4 rounded-[12px] bg-[var(--warning-soft)] px-4 py-2.5 text-[13px] text-[var(--warning)]">
            {offline ? "Offline. Showing your saved copy." : "Back online."}{" "}
            {pendingSync > 0 ? `${pendingSync} entr${pendingSync === 1 ? "y" : "ies"} will sync when you reconnect.` : "New entries are kept on this phone until then."}
          </p>
        ) : null}
        {state === "error" && client ? (
          <div className="mb-5">
            <Banner tone="error" title="Could not load your data:">{error}</Banner>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}

