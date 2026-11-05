/**
 * Auth cookie lifetime. A browser that has signed in once stays signed in:
 * the cookie lasts about 400 days (the maximum browsers allow) and every
 * request through `proxy.ts` refreshes it, so an in-use device never expires.
 */
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export const AUTH_COOKIE_OPTIONS = {
  maxAge: AUTH_COOKIE_MAX_AGE,
  path: "/",
  sameSite: "lax" as const,
};
