import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { Budgets } from "@/components/Budgets";

export const metadata: Metadata = { title: "Budgets" };

export default function Page() {
  return (
    <AppShell>
      <Budgets />
    </AppShell>
  );
}