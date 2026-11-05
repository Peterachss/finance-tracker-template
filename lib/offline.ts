import type { Workspace } from "./supabase/data";
import type { TransactionInput } from "./types";

/**
 * Device-side copy of the workspace and a queue of entries logged offline.
 *
 * The cache lets the app paint the last known numbers instantly (and work with
 * no signal); the network refresh then replaces them. Queued batches keep the
 * request id they were created with, so syncing them later goes through the
 * same replay-safe save and can never double-insert.
 */

const CACHE_KEY = "ft-cache-v1";
const QUEUE_KEY = "ft-queue-v1";

export interface CachedSession {
  userId: string;
  email: string | null;
  workspace: Workspace;
  savedAt: string;
}

export interface QueuedBatch {
  requestId: string;
  creates: TransactionInput[];
  queuedAt: string;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app still works online.
  }
}

export function readCache(): CachedSession | null {
  return read<CachedSession>(CACHE_KEY);
}

export function writeCache(userId: string, email: string | null, workspace: Workspace) {
  write(CACHE_KEY, { userId, email, workspace, savedAt: new Date().toISOString() } satisfies CachedSession);
}

export function clearCache() {
  write(CACHE_KEY, null);
  write(QUEUE_KEY, null);
}

export function readQueue(): QueuedBatch[] {
  return read<QueuedBatch[]>(QUEUE_KEY) ?? [];
}

export function enqueue(batch: QueuedBatch) {
  write(QUEUE_KEY, [...readQueue(), batch]);
}

export function dequeue(requestId: string) {
  const rest = readQueue().filter((b) => b.requestId !== requestId);
  write(QUEUE_KEY, rest.length ? rest : null);
}

/** True when a failure means "no connection" rather than a real server error. */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout/i.test(text);
}
