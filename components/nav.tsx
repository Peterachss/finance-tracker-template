"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  ChartLine,
  ChartPie,
  LayoutDashboard,
  LogOut,
  Moon,
  PiggyBank,
  Receipt,
  Settings as SettingsIcon,
  Sun,
  SunMoon,
  Table2,
  Wallet,
} from "lucide-react";
import { useWorkspace } from "@/lib/store";
import { Logo } from "@/components/Logo";

const NAV = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/spreadsheet", label: "Sheet", Icon: Table2 },
  { href: "/allowance", label: "Allowance", Icon: ChartPie },
  { href: "/bills", label: "Subscriptions", Icon: Receipt },
  { href: "/goals", label: "Dream list", Icon: PiggyBank },
  { href: "/budgets", label: "Budgets", Icon: Wallet },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
] as const;


/* ------------------------------------------------------------------ theme */

function subscribeToTheme(onChange: () => void) {
  window.addEventListener("ft-theme", onChange);
  return () => window.removeEventListener("ft-theme", onChange);
}

export type ThemeMode = "light" | "dark" | "system";

const THEME_LABEL: Record<ThemeMode, string> = { system: "Auto theme", light: "Light theme", dark: "Dark theme" };
const NEXT_MODE: Record<ThemeMode, ThemeMode> = { system: "light", light: "dark", dark: "system" };

/** Saved choice; "system" follows the device's appearance setting. */
export function readThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem("ft-theme");
    return saved === "dark" || saved === "light" ? saved : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("ft-theme", mode);
  } catch {
    // Private browsing: the theme still applies for this session.
  }
  window.dispatchEvent(new Event("ft-theme"));
}

/** Sidebar theme switch: Auto (follow the device) → Light → Dark → Auto. */
function useTheme() {
  const mode = useSyncExternalStore(subscribeToTheme, readThemeMode, () => "system" as ThemeMode);
  const cycle = () => applyTheme(mode === "system" ? "light" : mode === "light" ? "dark" : "system");
  return { mode, cycle };
}

/* ------------------------------------------------------------------- mark */

/** The leaf mark. */
function BrandMark() {
  return <Logo size={32} className="shrink-0" />;
}

/* ------------------------------------------------------------------- rail */

/** One icon-only control: accessible name, visible tooltip, focus ring. */
function RailLink({ href, label, active, children }: {
  href: string;
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
      className={`group relative flex size-9 items-center justify-center gap-3 rounded-[8px] transition-colors 2xl:w-full 2xl:justify-start 2xl:px-2.5 ${
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
      }`}
    >
      {children}
      {/* From 2xl the rail gains a labelled panel, so the tooltip is not needed. */}
      <span aria-hidden="true" className="hidden text-[13px] font-medium 2xl:inline">
        {label}
      </span>
      {/* Tooltip. aria-label carries the accessible name regardless. */}
      <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-[6px] bg-[var(--text)] px-2 py-1 text-[11px] font-medium text-[var(--surface)] opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100 2xl:hidden">
        {label}
      </span>
    </Link>
  );
}

/** Ends this device's session, then leaves the protected area. */
function useSignOut() {
  const router = useRouter();
  const { client } = useWorkspace();
  return async () => {
    try {
      await client?.auth.signOut();
      // After a deliberate sign-out, the saved password waits for a tap instead of signing straight back in.
      await navigator.credentials?.preventSilentAccess?.().catch(() => undefined);
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };
}

function DesktopRail() {
  const pathname = usePathname();
  const { user } = useWorkspace();
  const { mode, cycle } = useTheme();
  const signOut = useSignOut();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[68px] flex-col items-center border-r border-[var(--line)] bg-[var(--surface)] py-4 md:flex 2xl:w-[212px] 2xl:items-stretch 2xl:px-3">
      <Link href="/" aria-label="Finance Tracker home" className="mb-5 flex items-center gap-2.5 2xl:px-1">
        <BrandMark />
        <span aria-hidden="true" className="hidden text-sm font-semibold tracking-tight 2xl:inline">Finance Tracker</span>
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-1 2xl:items-stretch" aria-label="Main">
        {NAV.map((item) => (
          <RailLink key={item.href} href={item.href} label={item.label} active={pathname === item.href}>
            <item.Icon className="size-[18px]" strokeWidth={1.75} />
          </RailLink>
        ))}
      </nav>

      <div className="flex flex-col items-center gap-1 border-t border-[var(--line)] pt-3 2xl:items-stretch">
        <button
          onClick={cycle}
          aria-label={`Theme: ${THEME_LABEL[mode]}. Switch to ${THEME_LABEL[NEXT_MODE[mode]]}`}
          title={`Theme: ${THEME_LABEL[mode]}`}
          className="flex size-9 items-center justify-center gap-3 rounded-[8px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)] 2xl:w-full 2xl:justify-start 2xl:px-2.5"
        >
          {mode === "system" ? <SunMoon className="size-[18px] shrink-0" strokeWidth={1.75} /> : mode === "dark" ? <Moon className="size-[18px] shrink-0" strokeWidth={1.75} /> : <Sun className="size-[18px] shrink-0" strokeWidth={1.75} />}
          <span aria-hidden="true" className="hidden text-[13px] font-medium 2xl:inline">
            {THEME_LABEL[mode]}
          </span>
        </button>
        <button
          onClick={() => void signOut()}
          aria-label={`Sign out${user?.email ? ` of ${user.email}` : ""}`}
          title={user?.email ?? "Sign out"}
          className="flex size-9 items-center justify-center gap-3 rounded-[8px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)] 2xl:w-full 2xl:justify-start 2xl:px-2.5"
        >
          <LogOut className="size-[18px] shrink-0" strokeWidth={1.75} />
          <span aria-hidden="true" className="hidden min-w-0 truncate text-[13px] font-medium 2xl:inline">
            Sign out
          </span>
        </button>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------- mobile nav */

function MobileTopBar() {
  const signOut = useSignOut();
  const pathname = usePathname();
  // Only Home has this bar; the other phone screens carry their own header.
  if (pathname !== "/") return null;

  return (
    <header className="flex h-16 items-center gap-3 px-5 pt-[env(safe-area-inset-top)] md:hidden">
      <Logo size={36} />
      <Link href="/analytics" aria-label="Analytics" className="ml-auto grid size-10 place-items-center rounded-full text-[var(--text)] hover:bg-black/5">
        <ChartLine className="size-[22px]" strokeWidth={1.5} />
      </Link>
      <button onClick={() => void signOut()} aria-label="Sign out" className="grid size-10 place-items-center rounded-full text-[var(--text)] hover:bg-black/5">
        <LogOut className="size-5" strokeWidth={1.5} />
      </button>
    </header>
  );
}

/** Auto dark: while the theme follows the device, flip live when the device does. */
function useFollowDeviceTheme() {
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readThemeMode() === "system") document.documentElement.classList.toggle("dark", media.matches);
      window.dispatchEvent(new Event("ft-theme"));
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
}

export function AppNav() {
  useFollowDeviceTheme();
  return (
    <>
      <DesktopRail />
      <MobileTopBar />
    </>
  );
}

/** Compact page header used across every route. */
export function PageHeader({ title, description, action }: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text)]">{title}</h1>
        {description ? (
          <p className="mt-0.5 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
