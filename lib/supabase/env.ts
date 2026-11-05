/**
 * Supabase configuration.
 *
 * Only the PUBLIC (anon / publishable) key may ever reach the browser. The
 * service-role key is never read here and must never be added to a
 * NEXT_PUBLIC_* variable — those are inlined into the client bundle.
 *
 * The client is created lazily so the project still builds and lints with no
 * credentials present; the UI then shows setup instructions instead of
 * pretending that cloud sync works.
 */

export interface SupabaseEnv {
  url: string | undefined;
  key: string | undefined;
  configured: boolean;
}

const PLACEHOLDERS = ["", "your-project-url", "your-anon-key", "changeme"];

function clean(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (PLACEHOLDERS.includes(trimmed.toLowerCase())) return undefined;
  return trimmed;
}

/**
 * A present value is not a usable value.
 *
 * `createBrowserClient` throws on a malformed URL, and it is called from a
 * `useMemo` during render, so a bad value would crash static prerendering and
 * take the production build down with it. That is exactly the failure this
 * module exists to prevent, so the URL is validated here and anything
 * unusable is reported as simply not configured.
 *
 * This also catches redacted placeholders such as the literal string
 * "[SENSITIVE]", which a plain non-empty check would happily accept.
 */
function cleanUrl(value: string | undefined): string | undefined {
  const cleaned = clean(value);
  if (!cleaned) return undefined;
  try {
    const url = new URL(cleaned);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (!url.hostname) return undefined;
    return cleaned;
  } catch {
    return undefined;
  }
}

export function supabaseEnv(): SupabaseEnv {
  const url = cleanUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  // `PUBLISHABLE_KEY` is the current name; `ANON_KEY` is still accepted.
  const key = clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return { url, key, configured: Boolean(url && key) };
}

export const SETUP_REQUIRED_MESSAGE =
  "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local and apply supabase/migrations/0001_init.sql. See README.md.";