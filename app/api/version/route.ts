/**
 * The commit this deployment was built from. The app compares it with the
 * commit it was loaded from and reloads itself when a newer version is live.
 */
export function GET() {
  return Response.json(
    { sha: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { headers: { "cache-control": "no-store" } },
  );
}
