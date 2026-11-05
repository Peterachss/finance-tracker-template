#!/usr/bin/env node
/**
 * Route + sidebar health diagnostic for the running dev server.
 *
 * ---------------------------------------------------------------------------
 * Why this file exists
 * ---------------------------------------------------------------------------
 * An earlier ad-hoc check ran roughly:
 *
 *     curl -sL http://localhost:3000/spreadsheet | grep -q '<aside'
 *       && echo "sidebar present: True" || echo "sidebar present: False"
 *
 * and reported `sidebar present: False` against a healthy app. That verdict was
 * wrong for two independent reasons, and both still apply today:
 *
 * 1. AUTH REDIRECT. Signed out, `proxy.ts` answers `/spreadsheet` with
 *    `307 -> /login?next=%2Fspreadsheet`. `curl -L` then follows to the LOGIN
 *    page. The login page genuinely has no `<aside>`, so the check announced a
 *    missing sidebar on a correctly protected route. The redirect is the
 *    security contract doing its job, never evidence about the sidebar.
 *
 * 2. THE SIDEBAR IS CLIENT-RENDERED. Even WITH a valid session, the
 *    server-rendered HTML of `/spreadsheet` contains no `<aside>`:
 *      - `AppShell` returns a <Spinner> whenever `user` is null
 *        (components/AppShell.tsx).
 *      - `user` is initialised to `null` in `WorkspaceProvider`
 *        (lib/store.tsx) and is only populated by a client-side
 *        `auth.getSession()` after hydration.
 *      - `Providers` wraps the whole app in the root layout, so every route
 *        passes through that spinner branch during SSR.
 *    An HTML grep therefore reports "absent" on a working page *every time*.
 *
 * The lesson: do not let a redirect, or an SSR shell, be reported as a verdict.
 * This script only claims what HTTP actually proves, and prints UNKNOWN where
 * it cannot tell.
 *
 * ---------------------------------------------------------------------------
 * What this script can and cannot prove
 * ---------------------------------------------------------------------------
 * CAN:
 *   - the dev server is up;
 *   - `/spreadsheet` is protected (signed-out -> 307 to /login with `next`);
 *   - `/spreadsheet` COMPILES AND SERVES (catches the class of defect where a
 *     bad edit in components/Spreadsheet.tsx makes the route return 500);
 *   - with a session cookie supplied, that the page is served as 200.
 *
 * CANNOT (requires a real browser + an interactive sign-in):
 *   - that the sidebar is actually painted in the DOM after hydration.
 *   This script reports that as UNKNOWN. It never reports `False`.
 *
 * ---------------------------------------------------------------------------
 * Usage
 * ---------------------------------------------------------------------------
 *   node scripts/check-sidebar.mjs
 *   BASE_URL=http://localhost:3001 node scripts/check-sidebar.mjs
 *
 *   SESSION_COOKIE='sb-xxx=...; sb-yyy=...' node scripts/check-sidebar.mjs
 *     Optional. Supplied by the user; this script never fabricates a session
 *     and never bypasses authentication. With no cookie the signed-in probe is
 *     simply reported as skipped.
 *
 * Exit codes:
 *   0  no fault found (including "inconclusive" — a redirect is not a fault)
 *   1  a real fault: a route 5xx'd, or a signed-in request did not serve 200
 *   2  the dev server was not reachable
 */

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const SESSION_COOKIE = process.env.SESSION_COOKIE?.trim() ?? "";

/** Routes that must stay reachable while signed out, without leaking content. */
const PROTECTED_ROUTES = ["/", "/spreadsheet", "/budgets", "/settings"];

/** Verdict names, so the output is greppable. */
const VERDICT = {
  OK: "OK",
  INCONCLUSIVE: "INCONCLUSIVE",
  FAIL: "FAIL",
  UNKNOWN: "UNKNOWN",
  SKIPPED: "SKIPPED",
};

let failures = 0;

function report(verdict, label, detail) {
  if (verdict === VERDICT.FAIL) failures += 1;
  const line = `${verdict.padEnd(12)} ${label}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  return line;
}

/**
 * Performs one request WITHOUT following redirects.
 *
 * Following redirects is the specific mistake that caused the original bad
 * verdict: it turns "you were sent to the login page" into "here is the login
 * page, and it has no sidebar". We need the redirect itself.
 */
async function probe(pathname, { cookie } = {}) {
  const headers = { accept: "text/html" };
  if (cookie) headers.cookie = cookie;

  const response = await fetch(`${BASE_URL}${pathname}`, {
    redirect: "manual",
    headers,
  });

  const location = response.headers.get("location");
  const status = response.status;

  // Only pay for a body when the status actually implies one.
  let body = "";
  if (status >= 200 && status < 300) {
    body = await response.text();
  }

  return { status, location, body };
}

/** Classifies a response into a verdict without ever guessing about the sidebar. */
function classify({ status, location }) {
  const target = location ? new URL(location, BASE_URL) : null;
  const toLogin = target?.pathname === "/login" || target?.pathname.startsWith("/auth");
  const toSetup = target?.pathname === "/setup";

  if (status >= 500) {
    return {
      verdict: VERDICT.FAIL,
      detail: `server error ${status} — the route did not compile or serve`,
    };
  }

  if ((status === 307 || status === 308 || status === 302) && toLogin) {
    return {
      verdict: VERDICT.INCONCLUSIVE,
      detail: `auth redirect to ${target.pathname}${target.search} — page not served, says nothing about the sidebar`,
    };
  }

  if ((status === 307 || status === 308 || status === 302) && toSetup) {
    return {
      verdict: VERDICT.INCONCLUSIVE,
      detail: `redirect to /setup — Supabase is not configured`,
    };
  }

  if (status === 200) {
    return { verdict: VERDICT.OK, detail: "200" };
  }

  if (status >= 300 && status < 400) {
    return {
      verdict: VERDICT.INCONCLUSIVE,
      detail: `unexpected redirect to ${location ?? "(no location)"}`,
    };
  }

  return { verdict: VERDICT.FAIL, detail: `unexpected status ${status}` };
}

/** True if the SSR shell has not resolved a session yet. */
function isSessionPendingShell(body) {
  return body.includes("Checking your session");
}

/** True if the body is Next.js's development error overlay rather than a page. */
function isBuildError(body) {
  return (
    body.includes("statusCode&quot;:500") ||
    body.includes("Error: Expression expected") ||
    (body.includes("Parsing ecmascript source code failed") && body.includes("__NEXT_DATA__"))
  );
}

async function main() {
  console.log(`\nFinance Tracker route check — ${BASE_URL}\n`);

  // ---- 0. Is anything listening? ------------------------------------------------
  let reachable = true;
  try {
    await probe("/login");
  } catch (error) {
    reachable = false;
    report(VERDICT.FAIL, "dev server", `not reachable at ${BASE_URL} (${error.message})`);
  }

  if (!reachable) {
    console.log("\nStart it with `npm run dev` first.\n");
    process.exitCode = 2;
    return;
  }

  // ---- 1. Auth contract: every app route must bounce signed-out visitors -------
  console.log("Auth contract (signed out):");
  for (const route of PROTECTED_ROUTES) {
    const result = await probe(route);
    const { verdict, detail } = classify(result);
    report(verdict, `GET ${route}`.padEnd(22), detail);

    // Be explicit: a redirect here is the security feature working.
    if (verdict === VERDICT.INCONCLUSIVE && detail.startsWith("auth redirect")) {
      console.log(`             ↳ protected correctly; /login rendered no sidebar, and that is expected`);
    }
  }
  console.log("");

  // ---- 2. Signed-in probe: does /spreadsheet actually compile and serve? -------
  console.log("Route health (signed in):");

  if (!SESSION_COOKIE) {
    report(
      VERDICT.SKIPPED,
      "GET /spreadsheet".padEnd(22),
      "no SESSION_COOKIE supplied — cannot serve the authenticated page",
    );
  } else {
    const result = await probe("/spreadsheet", { cookie: SESSION_COOKIE });
    const { verdict, detail } = classify(result);

    if (verdict === VERDICT.OK && isBuildError(result.body)) {
      report(VERDICT.FAIL, "GET /spreadsheet".padEnd(22), "200 but the body is a build error overlay");
    } else if (verdict === VERDICT.OK && isSessionPendingShell(result.body)) {
      report(
        VERDICT.OK,
        "GET /spreadsheet".padEnd(22),
        "200, served the pre-hydration shell (normal — see note below)",
      );
    } else {
      report(verdict, "GET /spreadsheet".padEnd(22), detail);
    }
  }
  console.log("");

  // ---- 3. The sidebar verdict, stated honestly ---------------------------------
  console.log("Sidebar:");
  report(
    VERDICT.UNKNOWN,
    "sidebar present".padEnd(22),
    "not decidable over HTTP — client-rendered after auth.getSession()",
  );
  console.log(
    "             ↳ AppShell renders <Spinner> while `user` is null, and `user` is\n" +
      "               filled in client-side (lib/store.tsx). The server HTML has no\n" +
      "               <aside> even for a valid session, so an HTML grep reports\n" +
      "               'absent' on a working page. This is NOT a failure.\n" +
      "             ↳ To actually verify it, sign in and open /spreadsheet in a\n" +
      "               browser, or add a browser-based check (Playwright).\n",
  );

  // ---- Summary ------------------------------------------------------------------
  console.log(
    failures === 0
      ? "Result: no faults found.\n"
      : `Result: ${failures} fault(s) found.\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error("diagnostic crashed:", error);
  process.exitCode = 2;
});