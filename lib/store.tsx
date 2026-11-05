"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "./supabase/client";
import {
  deleteTransactions,
  loadWorkspace,
  saveTransactionBatch,
  updateProfile,
  type Workspace,
} from "./supabase/data";
import type { Budget, CurrencyCode, Transaction, TransactionInput, TransactionUpdate } from "./types";
import { SETUP_REQUIRED_MESSAGE } from "./supabase/env";
import { DEMO_ENABLED, demoLoad, demoSave, demoWorkspace } from "./demo";
import { clearCache, dequeue, enqueue, isNetworkError, readCache, readQueue, writeCache } from "./offline";

export type LoadState = "loading" | "ready" | "error";

interface WorkspaceStore {
  client: SupabaseClient | null;
  user: User | null;
  state: LoadState;
  error: string | null;
  setupRequired: boolean;
  /** No connection: showing the saved copy; new entries are queued. */
  offline: boolean;
  /** Entries logged offline that have not reached the server yet. */
  pendingSync: number;

  profile: Workspace["profile"];
  accounts: Workspace["accounts"];
  categories: Workspace["categories"];
  transactions: Transaction[];
  budgets: Budget[];

  currency: CurrencyCode;
  refresh: () => Promise<Workspace | null>;
  commitBatch: (
    creates: TransactionInput[],
    updates: TransactionUpdate[],
  ) => Promise<{ created: number; updated: number; loaded: Workspace | null }>;
  removeTransactions: (ids: string[]) => Promise<void>;
  savePreferences: (patch: { currency?: CurrencyCode; month_start_day?: number }) => Promise<void>;
  setProfileLocal: (patch: { currency?: CurrencyCode; month_start_day?: number }) => void;
}

const StoreContext = createContext<WorkspaceStore | null>(null);

const EMPTY: Workspace = { profile: null, accounts: [], categories: [], transactions: [], budgets: [] };

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  return DEMO_ENABLED ? <DemoProvider>{children}</DemoProvider> : <LiveProvider>{children}</LiveProvider>;
}

/** Local-only store backed by `lib/demo.ts`, for previewing the UI without a sign-in. */
function DemoProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY);
  // Built after mount: the sample dates are relative to "now", which must not
  // be read during prerender.
  useEffect(() => {
    const timer = setTimeout(() => setWorkspace(demoLoad<Workspace>("workspace") ?? demoWorkspace()), 0);
    return () => clearTimeout(timer);
  }, []);
  // Keep every change in this browser so a reload doesn't lose it.
  useEffect(() => {
    if (workspace.profile) demoSave("workspace", workspace);
  }, [workspace]);
  const value = useMemo<WorkspaceStore>(() => {
    const noop = async () => {};
    return {
      client: null,
      // No user until mounted, so the shell shows its spinner during prerender
      // instead of rendering date-dependent pages on the server.
      user: workspace.profile ? ({ id: "demo-user", email: "demo@example.test" } as User) : null,
      state: workspace.profile ? "ready" : "loading",
      error: null,
      setupRequired: false,
      offline: false,
      pendingSync: 0,
      ...workspace,
      currency: workspace.profile?.currency ?? "USD",
      refresh: async () => workspace,
      commitBatch: async (creates, updates) => {
        const now = new Date().toISOString();
        const added = creates.map((c) => ({
          ...c, id: crypto.randomUUID(), user_id: "demo-user", created_at: now, updated_at: now, version: 1,
        }));
        setWorkspace((w) => ({
          ...w,
          transactions: [
            ...added,
            ...w.transactions.map((t) => {
              const u = updates.find((x) => x.id === t.id);
              return u ? { ...t, ...u, version: t.version + 1, updated_at: now } : t;
            }),
          ],
        }));
        return { created: added.length, updated: updates.length, loaded: null };
      },
      removeTransactions: async (ids) => {
        setWorkspace((w) => ({ ...w, transactions: w.transactions.filter((t) => !ids.includes(t.id)) }));
      },
      savePreferences: noop,
      setProfileLocal: () => {},
    };
  }, [workspace]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function LiveProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<LoadState>(client ? "loading" : "error");
  const [error, setError] = useState<string | null>(client ? null : SETUP_REQUIRED_MESSAGE);
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY);
  const [offline, setOffline] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  // One request id per distinct batch, kept until that batch succeeds, so a
  // retry after a lost response replays on the server instead of duplicating.
  const pendingBatch = useRef<{ fingerprint: string; requestId: string } | null>(null);

  /**
   * Reload from the database and hand the result back to the caller, so the
   * spreadsheet can rebuild its drafts from exactly what was just confirmed
   * rather than waiting for the next render.
   */
  /** Sends entries logged offline; each keeps its request id, so a resend is harmless. */
  const flushQueue = useCallback(async () => {
    if (!client) return;
    for (const batch of readQueue()) {
      await saveTransactionBatch(client, batch.creates, [], batch.requestId);
      dequeue(batch.requestId);
    }
    setPendingSync(readQueue().length);
  }, [client]);

  const refresh = useCallback(async (): Promise<Workspace | null> => {
    if (!client) return null;
    try {
      const { data: session } = await client.auth.getSession();
      const sessionUser = session.session?.user ?? null;
      setUser(sessionUser);
      if (!sessionUser) {
        clearCache();
        setWorkspace(EMPTY);
        setState("ready");
        return null;
      }
      // Only the first load shows a skeleton; later refreshes swap data in place
      // so a save or a sync from another device never blanks the screen.
      setState((current) => (current === "ready" ? current : "loading"));
      if (readQueue().length) await flushQueue();
      const loaded = await loadWorkspace(client);
      setWorkspace(loaded);
      writeCache(sessionUser.id, sessionUser.email ?? null, loaded);
      setOffline(false);
      setError(null);
      setState("ready");
      return loaded;
    } catch (cause) {
      // No signal: keep showing the saved copy instead of an error screen.
      if (isNetworkError(cause) && readCache()) {
        setOffline(true);
        setState("ready");
        return null;
      }
      setError(cause instanceof Error ? cause.message : String(cause));
      setState("error");
      return null;
    }
  }, [client, flushQueue]);

  // Paint the last saved copy at once, then refresh from the network.
  useEffect(() => {
    if (!client) return;
    const timer = setTimeout(() => {
      const cached = readCache();
      if (cached) {
        setUser((current) => current ?? ({ id: cached.userId, email: cached.email ?? undefined } as User));
        setWorkspace((current) => (current === EMPTY ? cached.workspace : current));
        setState((current) => (current === "loading" ? "ready" : current));
      }
      setPendingSync(readQueue().length);
    }, 0);
    return () => clearTimeout(timer);
  }, [client]);

  // Coming back online: sync anything logged offline, then reload.
  useEffect(() => {
    const onOnline = () => void refresh();
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refresh]);

  // The reload is asynchronous, so run it after this effect returns.
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  // Sign-in and sign-out must be reflected without a manual reload.
  useEffect(() => {
    if (!client) return;
    const { data: subscription } = client.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => subscription.subscription.unsubscribe();
  }, [client, refresh]);

  /**
   * Reload when another device saves. Realtime is a convenience: a refresh
   * always produces the same numbers as the database either way.
   */
  useEffect(() => {
    if (!client || !user) return;
    // A 50-row paste emits 50 change events; coalesce them into one reload.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = client
      .channel("transactions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => void refresh(), 400);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [client, user, refresh]);

  /** Saves the batch, then reloads once and hands back what was stored. */
  const commitBatch = useCallback(
    async (creates: TransactionInput[], updates: TransactionUpdate[]) => {
      if (!client) throw new Error(SETUP_REQUIRED_MESSAGE);
      const fingerprint = JSON.stringify([creates, updates]);
      if (pendingBatch.current?.fingerprint !== fingerprint) {
        pendingBatch.current = { fingerprint, requestId: crypto.randomUUID() };
      }
      const requestId = pendingBatch.current.requestId;

      /** Offline: keep the entries on the device and show them straight away. */
      const queueLocally = () => {
        enqueue({ requestId, creates, queuedAt: new Date().toISOString() });
        pendingBatch.current = null;
        const now = new Date().toISOString();
        setWorkspace((current) => {
          const next = {
            ...current,
            transactions: [
              ...creates.map((c) => ({
                ...c, id: `local-${crypto.randomUUID()}`, user_id: user?.id ?? "", created_at: now, updated_at: now, version: 1,
              })),
              ...current.transactions,
            ],
          };
          if (user) writeCache(user.id, user.email ?? null, next);
          return next;
        });
        setPendingSync(readQueue().length);
        setOffline(true);
        return { created: creates.length, updated: 0, loaded: null };
      };

      if (updates.length === 0 && typeof navigator !== "undefined" && navigator.onLine === false) return queueLocally();
      try {
        const result = await saveTransactionBatch(client, creates, updates, requestId);
        // A definite answer (stored or replayed) ends this request id.
        pendingBatch.current = null;
        const loaded = await refresh();
        return { ...result, loaded };
      } catch (cause) {
        if (updates.length === 0 && isNetworkError(cause)) return queueLocally();
        throw cause;
      }
    },
    [client, refresh, user],
  );

  const removeTransactions = useCallback(
    async (ids: string[]) => {
      if (!client) throw new Error(SETUP_REQUIRED_MESSAGE);
      await deleteTransactions(client, ids);
      await refresh();
    },
    [client, refresh],
  );

  const setProfileLocal = useCallback((patch: { currency?: CurrencyCode; month_start_day?: number }) => {
    setWorkspace((current) => ({
      ...current,
      profile: current.profile ? { ...current.profile, ...patch } : current.profile,
    }));
  }, []);

  const savePreferences = useCallback(
    async (patch: { currency?: CurrencyCode; month_start_day?: number }) => {
      if (!client) throw new Error(SETUP_REQUIRED_MESSAGE);
      await updateProfile(client, patch);
      await refresh();
    },
    [client, refresh],
  );

  const value = useMemo<WorkspaceStore>(
    () => ({
      client,
      user,
      state,
      error,
      setupRequired: !client,
      offline,
      pendingSync,
      profile: workspace.profile,
      accounts: workspace.accounts,
      categories: workspace.categories,
      transactions: workspace.transactions,
      budgets: workspace.budgets,
      currency: workspace.profile?.currency ?? "VND",
      refresh,
      commitBatch,
      removeTransactions,
      savePreferences,
      setProfileLocal,
    }),
    [
      client, user, state, error, workspace, refresh, offline, pendingSync,
      commitBatch, removeTransactions, savePreferences, setProfileLocal,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useWorkspace(): WorkspaceStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return store;
}

/** Accounts offered for new rows (archived ones are hidden by default). */
/** Active accounts, bank accounts first (Bank transfer is the default way to pay). */
export function activeAccounts(accounts: Workspace["accounts"]): Workspace["accounts"] {
  const rank = (kind: string) => (kind === "bank" ? 0 : kind === "ewallet" ? 1 : kind === "cash" ? 2 : 3);
  return accounts.filter((account) => !account.archived).sort((a, b) => rank(a.kind) - rank(b.kind));
}

export function activeCategories(categories: Workspace["categories"]): Workspace["categories"] {
  return categories.filter((category) => !category.archived);
}