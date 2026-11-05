import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

/**
 * The authentication contract in `proxy.ts`.
 *
 * These tests exist to protect the behaviour that a buggy "sidebar check" tried
 * to work around. A signed-out visitor to any app route must be redirected to
 * /login with the attempted path preserved in `next`. If that redirect ever
 * disappears, the routes below are open — so they are asserted directly against
 * the real `proxy` function rather than inferred from an HTTP probe.
 *
 * `@supabase/ssr` is the only thing stubbed: it would otherwise make a network
 * call to Supabase. `NextRequest`/`NextResponse` are real.
 */

const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: () => getUser(),
      // The proxy now uses getClaims; derive it from the same mock.
      getClaims: async () => {
        const result = await getUser();
        const user = result?.data?.user;
        return { data: user ? { claims: { sub: user.id ?? "user" } } : null, error: null };
      },
      signOut: vi.fn(),
    },
  }),
}));

/** Pretends the app is configured; otherwise the proxy redirects to /setup. */
function configureSupabase() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
}

const get = (pathname: string) =>
  proxy(new NextRequest(`http://localhost:3000${pathname}`));

beforeEach(() => {
  getUser.mockReset();
  configureSupabase();
});

describe("signed-out visitors are redirected to /login", () => {
  it.each(["/", "/spreadsheet", "/budgets", "/settings"])(
    "redirects GET %s to /login",
    async (pathname) => {
      getUser.mockResolvedValue({ data: { user: null }, error: null });

      const response = await get(pathname);

      expect(response.status).toBe(307);

      const location = new URL(response.headers.get("location")!, "http://localhost:3000");
      expect(location.pathname).toBe("/login");
    },
  );

  it("preserves the attempted path in `next` so sign-in can return there", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await get("/spreadsheet");

    const location = new URL(response.headers.get("location")!, "http://localhost:3000");
    expect(location.searchParams.get("next")).toBe("/spreadsheet");
  });

  it("does not send /login into a redirect loop", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await get("/login");

    // The auth route itself must be served, not redirected back to /login.
    expect(response.status).not.toBe(307);
    expect(response.headers.get("location")).toBeNull();
  });

  it("lets /setup through even when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await get("/setup");

    expect(response.headers.get("location")).toBeNull();
  });
});

describe("signed-in visitors", () => {
  it("is served /spreadsheet instead of being redirected", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "a@example.com" } },
      error: null,
    });

    const response = await get("/spreadsheet");

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("is bounced off /login to the dashboard", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "a@example.com" } },
      error: null,
    });

    const response = await get("/login");

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!, "http://localhost:3000");
    expect(location.pathname).toBe("/");
  });
});

describe("unconfigured Supabase", () => {
  it("sends everything except /setup and /login to the setup screen", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await get("/spreadsheet");

    const location = new URL(response.headers.get("location")!, "http://localhost:3000");
    expect(location.pathname).toBe("/setup");
  });
});