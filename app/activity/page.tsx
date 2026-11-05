import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { Activity } from "@/components/Activity";

export const metadata: Metadata = { title: "Transactions" };

export default function Page() {
  return (
    <AppShell>
      <Activity />
    </AppShell>
  );
}
