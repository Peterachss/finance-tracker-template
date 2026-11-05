import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <main className="grid min-h-dvh bg-[var(--surface)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Laptop: a forest panel carrying the mark, the one place the brand gets room. */}
      <section aria-hidden="true" className="relative hidden overflow-hidden bg-[var(--forest)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <span className="text-[17px] font-medium">Finance Tracker</span>
        </div>
        {/* The leaf again, very large and quiet, cropped by the panel edge. */}
        <svg viewBox="0 0 32 32" className="pointer-events-none absolute -bottom-40 -right-40 size-[620px] opacity-[0.09]">
          <path d="M9.73 22.27A12.23 12.23 0 0 1 22.27 9.73A12.23 12.23 0 0 1 9.73 22.27Z" fill="#f3f68c" />
        </svg>
        <div className="relative max-w-[440px]">
          <p className="text-[44px] font-semibold leading-[1.05] tracking-[-0.035em]">
            Log it in seconds.
            <br />
            <span className="text-[var(--lime)]">See where it went.</span>
          </p>
          <p className="mt-5 text-[16px] leading-relaxed text-white/70">
            Your allowance, bills, savings and every payment, the same on your iPhone and your laptop.
          </p>
        </div>
      </section>

      {/* Form side: mint wash on the phone, plain surface on a laptop. */}
      <section className="flex flex-col justify-center bg-gradient-to-b from-[var(--mint)] to-[var(--mint-2)] px-5 py-10 lg:bg-none lg:bg-[var(--surface)] lg:px-16">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo size={44} />
            <span className="text-[17px] font-medium">Finance Tracker</span>
          </div>
          <div className="rounded-[28px] bg-[var(--surface)] p-6 shadow-[0_24px_48px_-32px_rgb(17_24_22/0.45)] lg:rounded-none lg:p-0 lg:shadow-none">
            <LoginForm />
          </div>
          <p className="mt-6 text-center text-[12px] text-[var(--text-muted)] lg:text-left">
            Your records live in your own database and are only visible to your account.
          </p>
        </div>
      </section>
    </main>
  );
}
