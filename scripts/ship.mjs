// Ships green local work to production: verify -> commit -> rebase -> push main.
// Vercel deploys every push to `main`, so this is the whole "localhost to web" path.
//   npm run ship                 commit with a default message
//   npm run ship -- "message"    commit with your message
//   node scripts/ship.mjs --if-dirty   exit quietly when there is nothing to ship (used by the Stop hook)
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const ifDirty = args.includes("--if-dirty");
const message =
  args.filter((a) => !a.startsWith("--")).join(" ") ||
  `chore: auto-ship ${new Date().toISOString()}`;

function run(cmd, cmdArgs, { capture = false } = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    encoding: "utf8",
    // Only npm needs a shell on Windows (npm.cmd). git must not get one, or a
    // commit message with spaces is split into separate arguments.
    shell: process.platform === "win32" && cmd === "npm",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (r.status !== 0 && !capture) {
    console.error(`ship: "${cmd} ${cmdArgs.join(" ")}" failed (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
  return r;
}

const out = (cmd, cmdArgs) => (run(cmd, cmdArgs, { capture: true }).stdout ?? "").trim();

const branch = out("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main") {
  console.error(`ship: on "${branch}", not main. Refusing.`);
  process.exit(1);
}

const dirty = out("git", ["status", "--porcelain"]);
if (!dirty) {
  if (!ifDirty) console.log("ship: nothing to ship, tree is clean.");
  process.exit(0);
}

// Never ship a secret: any changed path that is an env file other than the example.
const envFile = /(^|[\\/])\.env(?!\.example$)[^\\/]*$/;
const risky = dirty
  .split("\n")
  .map((l) => l.slice(3).trim().replace(/^"|"$/g, ""))
  .filter((p) => envFile.test(p));
if (risky.length) {
  console.error(`ship: refusing, env file(s) in the change set: ${risky.join(", ")}`);
  process.exit(1);
}

console.log("ship: running verify (lint, typecheck, tests, build)...");
run("npm", ["run", "verify"]);

run("git", ["add", "-A"]);
if (out("git", ["diff", "--cached", "--name-only"])) {
  run("git", ["commit", "-m", message]);
}
run("git", ["pull", "--rebase", "--autostash", "origin", "main"]);
run("git", ["push", "origin", "main"]);

console.log(`ship: pushed ${out("git", ["rev-parse", "--short", "HEAD"])} to origin/main. Vercel will deploy it.`);
