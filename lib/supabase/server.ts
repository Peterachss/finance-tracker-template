import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_COOKIE_OPTIONS } from "./cookie";
import { supabaseEnv } from "./env";

/**
 * Server client. Next.js 16 makes `cookies()` async.
 * Writes to the cookie jar are only allowed in a Server Action or Route
 * Handler, so failures are tolerated when rendering a page.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient | null> {
  const { url, key, configured } = supabaseEnv();
  if (!configured || !url || !key) return null;

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: the proxy refreshes the session.
        }
      },
    },
  });
}