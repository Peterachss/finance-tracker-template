"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_COOKIE_OPTIONS } from "./cookie";
import { supabaseEnv } from "./env";

let cached: SupabaseClient | null = null;

/** Browser client backed by cookies, so the session survives a refresh. */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  const { url, key, configured } = supabaseEnv();
  if (!configured || !url || !key) return null;
  if (!cached) {
    try {
      cached = createBrowserClient(url, key, {
        cookieOptions: AUTH_COOKIE_OPTIONS,
        auth: { persistSession: true, autoRefreshToken: true },
      });
    } catch {
      // Never let a client-construction failure escape into render. This is
      // called from a `useMemo` during prerendering, so a throw here would
      // fail the production build rather than showing the setup banner.
      return null;
    }
  }
  return cached;
}