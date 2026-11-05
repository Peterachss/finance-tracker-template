import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source encoding guard.
 *
 * Editing these files with Windows PowerShell 5.1 and `Set-Content -Encoding
 * utf8` silently does two damaging things: it prepends a UTF-8 BOM, and it
 * decodes existing UTF-8 bytes as Windows-1252 before re-encoding them. The
 * second one turns an ellipsis into three stray Latin-1 characters and a middle
 * dot into two, so user-facing strings render as garbage while the code still
 * compiles and every functional test still passes.
 *
 * These assertions fail loudly instead. Use the editor, or
 * `Set-Content -Encoding utf8NoBOM` on PowerShell 7+.
 */

const SOURCE_DIRS = ["app", "components", "lib", "tests", "supabase"];
const EXTENSIONS = /\.(ts|tsx|css|sql|md|json)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.test(name)) out.push(full);
  }
  return out;
}

const files = SOURCE_DIRS.flatMap((dir) => walk(dir))
  // package-lock.json is machine-generated and legitimately holds raw bytes.
  .filter((file) => !file.endsWith("package-lock.json"));

/**
 * A UTF-8 byte sequence mis-decoded through Windows-1252 always leaves a lead
 * character, rendered from the first byte, followed by a byte from the 0x80-0xBF
 * range rendered as a printable character.
 */
const MOJIBAKE = new RegExp(
  "[\\u00c2\\u00c3\\u00e2\\u00f0]" +
    "[\\u00a0-\\u00ff\\u20ac\\u2013\\u2014\\u2018\\u2019\\u201a\\u201c\\u201d" +
    "\\u2022\\u2122\\u2026]",
);

describe("source encoding", () => {
  it("finds files to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("has no UTF-8 BOM", () => {
    const offenders = files.filter((file) => {
      const bytes = readFileSync(file);
      return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    });
    expect(offenders).toEqual([]);
  });

  it("has no mis-decoded UTF-8 (mojibake)", () => {
    const offenders = files.filter((file) => MOJIBAKE.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("has no Unicode replacement characters", () => {
    const offenders = files.filter((file) => readFileSync(file, "utf8").includes("\uFFFD"));
    expect(offenders).toEqual([]);
  });

  it("keeps the typographic characters the UI relies on intact", () => {
    // These appear literally in the source, so damage to them is visible here.
    expect(readFileSync("components/AppShell.tsx", "utf8")).toContain("Checking your session\u2026");
    expect(readFileSync("components/Dashboard.tsx", "utf8")).toContain("\u00b7");
  });
});

/**
 * Design-token guard.
 *
 * These values exist because the palette is a decision, not a preference. An
 * earlier forest-green token block was silently reverted to the previous violet
 * one by a `git checkout` used to undo unrelated encoding damage, and every
 * other check still passed: TypeScript compiled, lint was clean, all tests were
 * green and the production build succeeded. The only symptom was that the app
 * had quietly changed colour.
 *
 * This suite cannot see rendered pixels, so it asserts the source of truth
 * instead. app/globals.css is the single place tokens are defined.
 */
describe("design tokens", () => {
  const css = readFileSync("app/globals.css", "utf8");

  function token(name: string): string {
    // Matches the light-theme declaration inside :root, not the .dark block.
    const root = css.slice(css.indexOf(":root {"), css.indexOf(".dark {"));
    const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(root);
    if (!match) throw new Error(`Token --${name} is missing from :root in app/globals.css`);
    return match[1].toLowerCase();
  }

  it("defines the Nixtio mint-and-black light palette", () => {
    expect(token("bg")).toBe("#f4f6f5");
    expect(token("surface")).toBe("#ffffff");
    expect(token("text")).toBe("#111816");
    expect(token("text-muted")).toBe("#5d6a64");
    expect(token("line")).toBe("#e7ebe9");
    expect(token("gridline")).toBe("#edf0ee");
  });

  it("uses forest green for actions and two greens for the data series", () => {
    expect(token("accent")).toBe("#1f5c46");
    expect(token("accent-soft")).toBe("#e4f0ea");
    expect(token("series-1")).toBe("#1f7a57");
    expect(token("series-2")).toBe("#8fcfb1");
    expect(token("positive")).toBe("#1f7a57");
  });

  it("carries no leftover violet or rose tokens in the light theme", () => {
    const root = css.slice(css.indexOf(":root {"), css.indexOf(".dark {"));
    // 7957d5 / 8d6cdb / dda8c5 / a78bfa were the superseded lavender palette.
    for (const stale of ["#7957d5", "#8d6cdb", "#dda8c5", "#a78bfa", "#f2eefc"]) {
      expect(root.toLowerCase()).not.toContain(stale);
    }
  });

  it("keeps the dark theme coherent rather than inverted", () => {
    const dark = css.slice(css.indexOf(".dark {"));
    expect(dark).toContain("--bg: #0f1312");
    expect(dark).toContain("--accent: #6fbf98");
    expect(dark).toContain("--surface: #171c1a");
    // The two chart series must stay distinguishable in dark mode too.
    expect(token("series-1")).not.toBe(token("series-2"));
  });

  it("keeps the browser theme colour in step with the palette", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain("#f4f6f5");
    expect(layout).toContain("#0f1312");
    // The superseded value would have framed the page with the wrong chrome.
    expect(layout).not.toContain("#faf9f7");
  });

  it("keeps the accessibility rules the audit added", () => {
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(".skip-link");
    expect(css).toContain(":focus-visible");
  });
});