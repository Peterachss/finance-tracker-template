import type { Metadata } from "next";
import { Panel } from "@/components/ui";

export const metadata: Metadata = { title: "Setup required" };

const STEPS = [
  {
    title: "1. Create a Supabase project",
    body: "Sign up at supabase.com, create a free project and wait for the database to be ready.",
  },
  {
    title: "2. Apply the schema",
    body: "In the SQL editor, run the contents of supabase/migrations/0001_init.sql. It creates the tables, the Row Level Security policies and the batch save function.",
  },
  {
    title: "3. Add the environment variables",
    body: "Copy .env.example to .env.local and fill in the project URL and the publishable (anon) key from Project Settings → API. Never use the service-role key here.",
  },
  {
    title: "4. Restart and sign in",
    body: "Restart the dev server, open /login and create an account. Default accounts and categories are created automatically.",
  },
];

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Panel title="Supabase is not configured">
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          This app keeps every record in Supabase, so it needs a project before it can store anything. There is no local
          fallback that pretends to sync — configure the backend first.
        </p>
        <ol className="flex flex-col gap-3">
          {STEPS.map((step) => (
            <li key={step.title}>
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-sm text-[var(--text-muted)]">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          Full instructions, including deployment and iPhone installation, are in README.md.
        </p>
      </Panel>
    </main>
  );
}

