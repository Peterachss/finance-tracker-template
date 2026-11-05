import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { Goals } from "@/components/Goals";

export const metadata: Metadata = { title: "Dream list" };

export default function Page() {
  return (
    <AppShell>
      <Goals />
    </AppShell>
  );
}
