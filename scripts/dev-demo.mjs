// Runs `next dev` with sample data and no sign-in, for reviewing the UI locally.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const child = spawn("npx", ["next", "dev", "-p", process.env.PORT ?? "3123"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, NEXT_PUBLIC_DEMO: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
