import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { AUTH_COOKIE_OPTIONS } from "./lib/supabase/cookie";
import { supabaseEnv } from "./lib/supabase/env";

/**
 * Refreshes the Supabase auth cookie on every request and keeps signed-out
 * visitors out of the app. In Next.js 16 this file is `proxy.ts` (the old
 * `middleware.ts` name is deprecated) and runs on the Node.js runtime.
 */
export async function proxy(request: NextRequest) {
  // Local UI preview with sample data (never in production builds).
  if (process.env.NEXT_PUBLIC_DEMO === "1") return NextResponse.next();

  const { url, key, configured } = supabaseEnv();
  const { pathname } = request.nextUrl;

  if (!configured || !url || !key) {
    // No backend yet: show the setup screen rather than a broken app.
    if (pathname === "/setup") return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Do not run code between createServerClient and getUser: it can cause the
  // refreshed cookies to be dropped.
  // getClaims verifies the session token locally when the project signs with
  // asymmetric keys (no round trip to the auth server on every page open) and
  // falls back to a server check otherwise; it also refreshes the cookies.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  const isAuthRoute = pathname === "/login" || pathname.startsWith("/auth");
  const signedIn = Boolean(user);

  // /share/<token> is a read-only shared statement: no account needed.
  const isPublic = pathname.startsWith("/share/") || pathname === "/api/version";

  if (!signedIn && !isAuthRoute && !isPublic && pathname !== "/setup") {
    const redirectUrl = new URL("/login", request.url);
    if (pathname !== "/") redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (signedIn && isAuthRoute) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  // Static assets and the web manifest must stay reachable even when the app
  // redirects to /setup, otherwise the PWA cannot install.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|json|txt|xml|woff2?|js)$).*)",
  ],
};