import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { Bills } from "@/components/Bills";

export const metadata: Metadata = { title: "Bills & subscriptions" };

export default function Page() {
  return (
    <AppShell>
      <Bills />
    </AppShell>
  );
}
