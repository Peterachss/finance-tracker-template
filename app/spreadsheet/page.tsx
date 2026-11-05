import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { SheetPage } from "@/components/SheetPage";

export const metadata: Metadata = { title: "Sheet" };

export default function Page() {
  return (
    // `wide`: the grid is wider than a reading column, so this route uses the
    // full remaining width. Every other page keeps a centred measure.
    <AppShell wide>
      <SheetPage />
    </AppShell>
  );
}
