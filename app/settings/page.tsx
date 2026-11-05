import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { Settings } from "@/components/SettingsPage";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <AppShell>
      <Settings />
    </AppShell>
  );
}