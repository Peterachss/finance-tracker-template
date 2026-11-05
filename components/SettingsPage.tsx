"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, CircleUser, Download, Landmark, Settings as SettingsIcon, Tags, X } from "lucide-react";
import { applyTheme, readThemeMode, type ThemeMode } from "@/components/nav";
import { AccountsManager, CategoriesManager, Preferences } from "@/components/Settings";
import { Banner, Button } from "@/components/ui";
import { downloadCsv, transactionsToCsv } from "@/lib/csv";
import { useWorkspace } from "@/lib/store";
import { saveAccount, saveCategory } from "@/lib/supabase/data";

type Tab = "general" | "accounts" | "categories" | "data" | "account";

/** Zoom-style section list: tinted icon tiles, the active row filled forest green. */
const TABS: { id: Tab; label: string; hint: string; Icon: typeof SettingsIcon }[] = [
  { id: "general", label: "General", hint: "Theme, phone, currency, month start", Icon: SettingsIcon },
  { id: "accounts", label: "Accounts", hint: "Cash, bank, savings, e-wallets", Icon: Landmark },
  { id: "categories", label: "Categories", hint: "What your money is spent on", Icon: Tags },
  { id: "data", label: "Data & export", hint: "Download everything as CSV", Icon: Download },
  { id: "account", label: "Sign-in & devices", hint: "Stay signed in, sign out", Icon: CircleUser },
];

function subscribe(cb: () => void) {
  window.addEventListener("ft-theme", cb);
  return () => window.removeEventListener("ft-theme", cb);
}

function ThemePicker() {
  const mode = useSyncExternalStore(subscribe, readThemeMode, () => "system" as ThemeMode);
  const options: { id: ThemeMode; label: string }[] = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "system", label: "Use system setting" },
  ];
  return (
    <fieldset>
      <legend className="text-[15px] font-semibold">Theme</legend>
      <div className="mt-3 flex flex-wrap gap-5">
        {options.map((o) => {
          const dark = o.id === "dark";
          return (
            <label key={o.id} className="flex cursor-pointer flex-col gap-2">
              {/* Miniature window drawn in the theme it selects. */}
              <span
                aria-hidden="true"
                className={`relative block h-[72px] w-[112px] overflow-hidden rounded-[8px] border shadow-[0_1px_3px_rgb(17_24_22/0.12)] ${
                  mode === o.id ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30" : "border-[var(--line-strong)]"
                }`}
                style={{ background: dark ? "#171c1a" : o.id === "light" ? "#ffffff" : "linear-gradient(90deg,#ffffff 50%,#171c1a 50%)" }}
              >
                <span className="absolute inset-y-0 left-0 w-6" style={{ background: dark ? "#0f1312" : "#f4f6f5" }} />
                <span className="absolute left-9 top-4 h-1.5 w-12 rounded-full" style={{ background: dark ? "#6fbf98" : "#1f5c46" }} />
                <span className="absolute left-9 top-8 h-1.5 w-16 rounded-full" style={{ background: dark ? "#34403b" : "#e7ebe9" }} />
                <span className="absolute left-9 top-12 h-1.5 w-10 rounded-full" style={{ background: dark ? "#34403b" : "#e7ebe9" }} />
              </span>
              <span className="flex items-center gap-2 text-[14px]">
                <input type="radio" name="theme" checked={mode === o.id} onChange={() => applyTheme(o.id)} className="size-4 accent-[var(--accent)]" />
                {o.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Airbnb-style switch row: title, one line of detail, round switch with a tick or cross. */
function SwitchRow({ title, detail, checked, onChange }: {
  title: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-6 border-b border-[var(--line)] py-4 last:border-b-0">
      <span>
        <span className="block text-[15px]">{title}</span>
        <span className="mt-0.5 block text-[13px] text-[var(--text-muted)]">{detail}</span>
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-8 w-[52px] rounded-full bg-[var(--line-strong)] transition-colors peer-checked:bg-[var(--accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)] peer-focus-visible:ring-offset-2" />
        <span className="pointer-events-none absolute left-1 top-1 grid size-6 place-items-center rounded-full bg-white shadow transition-transform peer-checked:translate-x-5">
          {checked ? <Check className="size-3.5 text-[var(--accent)]" strokeWidth={3} /> : <X className="size-3.5 text-[#929d98]" strokeWidth={2.5} />}
        </span>
      </span>
    </label>
  );
}

/** A per-device preference stored in this browser. */
function usePref(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem(key);
        if (saved !== null) setValue(saved === "1");
      } catch {
        // Storage blocked: keep the default.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [key]);
  const set = (next: boolean) => {
    setValue(next);
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {
      // Storage blocked: the switch still works for this visit.
    }
  };
  return [value, set];
}

export function Settings() {
  const { accounts, categories, transactions, currency, profile, client, user, refresh, state, error, setupRequired, savePreferences } =
    useWorkspace();
  const [tab, setTab] = useState<Tab>("general");
  // Phone: the section list is the first screen; a section opens on tap.
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [hideBalance, setHideBalance] = usePref("ft-hide-balance", false);
  const router = useRouter();

  if (setupRequired) return <Banner tone="error" title="Not configured:">{error}</Banner>;
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5">
      <h1 className={`text-[30px] font-semibold tracking-[-0.025em] ${phoneOpen ? "max-md:hidden" : ""}`}>Settings</h1>
      {state === "error" ? <Banner tone="error" title="Could not load:">{error}</Banner> : null}

      <div className="overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)] md:grid md:min-h-[560px] md:grid-cols-[264px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className={`p-3 md:border-r md:border-[var(--line)] ${phoneOpen ? "max-md:hidden" : ""}`}>
          <ul className="flex flex-col gap-1">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => { setTab(t.id); setPhoneOpen(true); }}
                    aria-current={active ? "page" : undefined}
                    className={`group flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors ${
                      active ? "md:bg-[var(--accent)] md:text-[var(--on-accent)]" : "hover:bg-[var(--surface-sunken)]"
                    }`}
                  >
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-[8px] bg-[var(--accent-soft)] text-[var(--accent)] ${
                        active ? "md:bg-white/15 md:text-[var(--on-accent)]" : ""
                      }`}
                    >
                      <t.Icon className="size-[18px]" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">{t.label}</span>
                      <span className="block truncate text-[12px] text-[var(--text-muted)] md:hidden">{t.hint}</span>
                    </span>
                    <ChevronRight className="size-4 text-[var(--text-faint)] md:hidden" strokeWidth={1.75} />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={`min-w-0 p-5 md:p-8 ${phoneOpen ? "" : "max-md:hidden"}`}>
          <button type="button" onClick={() => setPhoneOpen(false)} className="mb-3 inline-flex items-center gap-1 text-[14px] text-[var(--text-muted)] md:hidden">
            <ChevronLeft className="size-4" strokeWidth={2} />
            Settings
          </button>
          <h2 className="mb-6 text-[24px] font-semibold tracking-[-0.02em] md:text-[19px]">{current.label}</h2>

          {tab === "general" ? (
            <div className="flex flex-col gap-9">
              <ThemePicker />
              <section>
                <h3 className="text-[15px] font-semibold">On this device</h3>
                <div className="mt-1">
                  <SwitchRow
                    title="Hide balance when the app opens"
                    detail="The yellow card starts hidden; tap the eye to show it."
                    checked={hideBalance}
                    onChange={setHideBalance}
                  />
                </div>
              </section>
              <Preferences currency={currency} monthStartDay={profile?.month_start_day ?? 1} onSave={savePreferences} />
            </div>
          ) : null}

          {tab === "accounts" ? (
            <AccountsManager accounts={accounts} currency={currency} onChanged={refresh} save={(account) => saveAccount(client!, account)} />
          ) : null}

          {tab === "categories" ? (
            <CategoriesManager categories={categories} onChanged={refresh} save={(category) => saveCategory(client!, category)} />
          ) : null}

          {tab === "data" ? (
            <div>
              <p className="max-w-[60ch] text-[14px] text-[var(--text-muted)]">
                Download every transaction you own. Columns match the Transactions sheet, so the file can be edited and imported back.
              </p>
              <Button className="mt-4" onClick={() => downloadCsv("transactions.csv", transactionsToCsv(transactions, categories, accounts))}>
                Export transactions (CSV)
              </Button>
            </div>
          ) : null}

          {tab === "account" ? (
            <div className="flex max-w-[62ch] flex-col gap-4 text-[14px]">
              <p>Signed in as <span className="font-medium">{user?.email ?? "—"}</span>.</p>
              <p className="text-[var(--text-muted)]">
                Each device stays signed in for about 400 days and renews itself whenever you open the app, so you sign in once
                per device. On iPhone and iPad, sign in once inside the Home Screen app (it keeps its own storage, separate from
                Safari) and let Keychain save the password.
              </p>
              <Button
                variant="danger"
                className="self-start"
                onClick={async () => {
                  await client?.auth.signOut();
      // After a deliberate sign-out, the saved password waits for a tap instead of signing straight back in.
      await navigator.credentials?.preventSilentAccess?.().catch(() => undefined);
                  router.replace("/login");
                }}
              >
                Sign out of this device
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
