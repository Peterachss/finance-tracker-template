import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { Dashboard } from "@/components/Dashboard";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return (
    <AppShell>
      <Dashboard view="analytics" />
    </AppShell>
  );
}
