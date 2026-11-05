import { afterEach, describe, expect, it } from "vitest";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * The Supabase URL is inlined into the client bundle at build time, and the
 * browser client is constructed inside a `useMemo` during render. A value that
 * is present but unusable therefore has to be reported as "not configured",
 * because `createBrowserClient` throws on a malformed URL and that throw would
 * otherwise fail static prerendering and take the production build down.
 *
 * A real case: running `vercel pull` and then `vercel build` locally feeds the
 * literal redacted placeholder "[SENSITIVE]" into the build, which aborted
 * static prerendering outright.
 */

const URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const PUBLISHABLE_KEY = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
const ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

const VALID_URL = "https://abcdefghijklm.supabase.co";
const VALID_KEY = "sb_publishable_exampleexampleexample";

function setEnv(values: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

const original = {
  url: process.env[URL_KEY],
  publishable: process.env[PUBLISHABLE_KEY],
  anon: process.env[ANON_KEY],
};

afterEach(() => {
  setEnv({
    [URL_KEY]: original.url,
    [PUBLISHABLE_KEY]: original.publishable,
    [ANON_KEY]: original.anon,
  });
});

describe("supabaseEnv", () => {
  it("accepts a real project URL and publishable key", () => {
    setEnv({ [URL_KEY]: VALID_URL, [PUBLISHABLE_KEY]: VALID_KEY });
    expect(supabaseEnv()).toEqual({ url: VALID_URL, key: VALID_KEY, configured: true });
  });

  it("accepts the older anon key name", () => {
    setEnv({ [URL_KEY]: VALID_URL, [PUBLISHABLE_KEY]: undefined, [ANON_KEY]: VALID_KEY });
    expect(supabaseEnv().configured).toBe(true);
  });

  it("reports missing credentials as not configured", () => {
    setEnv({ [URL_KEY]: undefined, [PUBLISHABLE_KEY]: undefined, [ANON_KEY]: undefined });
    expect(supabaseEnv().configured).toBe(false);
  });

  it("reports a redacted placeholder as not configured rather than accepting it", () => {
    // The exact shape that failed a real production deploy.
    setEnv({ [URL_KEY]: "[SENSITIVE]", [PUBLISHABLE_KEY]: "[SENSITIVE]" });
    expect(supabaseEnv().configured).toBe(false);
    expect(supabaseEnv().url).toBeUndefined();
  });

  it("rejects a non-URL string instead of trusting that it is present", () => {
    for (const bad of ["undefined", "null", "not-a-url", "https://", "localhost:54321", "ftp://example.com"]) {
      setEnv({ [URL_KEY]: bad, [PUBLISHABLE_KEY]: VALID_KEY });
      expect(supabaseEnv().configured, `should reject ${bad}`).toBe(false);
    }
  });

  it("requires a key as well as a URL", () => {
    setEnv({ [URL_KEY]: VALID_URL, [PUBLISHABLE_KEY]: undefined, [ANON_KEY]: undefined });
    expect(supabaseEnv().configured).toBe(false);
  });

  it("trims surrounding whitespace", () => {
    setEnv({ [URL_KEY]: `  ${VALID_URL}  `, [PUBLISHABLE_KEY]: `  ${VALID_KEY}  ` });
    expect(supabaseEnv()).toEqual({ url: VALID_URL, key: VALID_KEY, configured: true });
  });
});