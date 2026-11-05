import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { Allowance } from "@/components/Allowance";

export const metadata: Metadata = { title: "Monthly allowance" };

export default function Page() {
  return (
    <AppShell>
      <Allowance />
    </AppShell>
  );
}
