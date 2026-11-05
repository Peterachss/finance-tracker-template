"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { DEMO_ENABLED } from "@/lib/demo";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "reset";

/**
 * The browser's saved-password store (Credential Management API). Chrome,
 * Edge and Android support it; Safari does not, and there the password
 * manager's autofill is the fallback. TypeScript's DOM lib has no
 * PasswordCredential, so it is reached through window.
 */
type SavedPassword = { id: string; password?: string; type: string };
function passwordStore() {
  if (typeof window === "undefined" || !("PasswordCredential" in window) || !navigator.credentials) return null;
  const Ctor = (window as unknown as { PasswordCredential: new (data: { id: string; password: string }) => Credential }).PasswordCredential;
  return {
    get: () => navigator.credentials.get({ password: true, mediation: "optional" } as CredentialRequestOptions) as Promise<SavedPassword | null>,
    save: (id: string, password: string) => navigator.credentials.store(new Ctor({ id, password })),
  };
}

const COPY: Record<Mode, { title: string; lead: string; action: string; busy: string }> = {
  signin: { title: "Welcome back", lead: "Sign in once on this device and it stays signed in.", action: "Sign in", busy: "Signing in…" },
  signup: { title: "Create your account", lead: "Use the same email on your iPhone and laptop to see the same records.", action: "Create account", busy: "Creating…" },
  reset: { title: "Reset your password", lead: "We'll email you a link to choose a new one.", action: "Send reset link", busy: "Sending…" },
};

const field =
  "h-12 w-full rounded-[14px] border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-[16px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/15";

/** Email + password only. No third-party auth, no bank credentials. */
export function LoginForm() {
  const router = useRouter();
  const client = getSupabaseBrowserClient();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = COPY[mode];
  const tried = useRef(false);

  const signIn = async (address: string, secret: string) => {
    if (!client) return;
    const { error: signInError } = await client.auth.signInWithPassword({ email: address, password: secret });
    if (signInError) throw signInError;
    // Offer the browser to keep it, so the next sign-in happens by itself.
    try {
      await passwordStore()?.save(address, secret);
    } catch {
      // Declined or unsupported: nothing to do.
    }
    router.push("/");
    router.refresh();
  };

  // Auto sign-in: if this browser saved the password before, use it straight away.
  useEffect(() => {
    if (tried.current || !client) return;
    tried.current = true;
    const store = passwordStore();
    if (!store) return;
    void store.get().then(async (saved) => {
      if (!saved?.password || saved.type !== "password") return;
      setEmail(saved.id);
      setBusy(true);
      setMessage("Signing you in…");
      try {
        await signIn(saved.id, saved.password);
      } catch {
        setMessage(null);
        setBusy(false);
      }
    }).catch(() => undefined);
  });

  if (!client && !DEMO_ENABLED) {
    return (
      <p role="alert" className="rounded-[14px] bg-[var(--danger-soft)] px-4 py-3 text-[14px] text-[var(--negative)]">
        Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart.
      </p>
    );
  }

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
    setMessage(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!client) return setError("This is the local preview; sign in on the real site.");
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else if (mode === "signup") {
        const { error: signUpError } = await client.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setMessage("Account created. Sign in to continue.");
        setMode("signin");
      } else {
        const { error: resetError } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        });
        if (resetError) throw resetError;
        setMessage("If that address has an account, the reset link is on its way.");
      }
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : String(cause);
      setError(/invalid login credentials/i.test(text) ? "That email and password don't match. Try again or reset your password." : text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.025em]">{copy.title}</h1>
      <p className="mt-1.5 text-[15px] text-[var(--text-muted)]">{copy.lead}</p>

      <form className="mt-7 flex flex-col gap-4" onSubmit={submit} noValidate={false}>
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-medium">Email</span>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={field}
          />
        </label>

        {mode !== "reset" ? (
          <label className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between">
              <span className="text-[14px] font-medium">Password</span>
              {mode === "signin" ? (
                <button type="button" onClick={() => switchTo("reset")} className="text-[13px] font-medium text-[var(--accent)] hover:underline">
                  Forgot password?
                </button>
              ) : (
                <span className="text-[12px] text-[var(--text-faint)]">At least 8 characters</span>
              )}
            </span>
            <span className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${field} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]"
              >
                {showPassword ? <EyeOff className="size-[18px]" strokeWidth={1.75} /> : <Eye className="size-[18px]" strokeWidth={1.75} />}
              </button>
            </span>
          </label>
        ) : null}

        {error ? <p role="alert" className="rounded-[12px] bg-[var(--danger-soft)] px-3.5 py-2.5 text-[14px] text-[var(--negative)]">{error}</p> : null}
        {message ? <p role="status" className="rounded-[12px] bg-[var(--accent-soft)] px-3.5 py-2.5 text-[14px] text-[var(--accent)]">{message}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 h-12 rounded-full bg-[var(--accent)] text-[16px] font-medium text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {busy ? copy.busy : copy.action}
        </button>
      </form>

      <p className="mt-6 text-center text-[14px] text-[var(--text-muted)]">
        {mode === "signin" ? (
          <>New here? <button type="button" onClick={() => switchTo("signup")} className="font-medium text-[var(--accent)] hover:underline">Create an account</button></>
        ) : (
          <button type="button" onClick={() => switchTo("signin")} className="font-medium text-[var(--accent)] hover:underline">Back to sign in</button>
        )}
      </p>
    </div>
  );
}
