"use client";

import { Activity } from "@/components/Activity";
import { PageHeader } from "@/components/nav";
import { SheetTabs } from "@/components/SheetTabs";
import { usePhoneLayout } from "@/lib/use-phone-layout";

/**
 * The Sheet is a laptop tool. On a phone the same address shows the
 * transactions list instead, with its back arrow to Home.
 */
export function SheetPage() {
  const phone = usePhoneLayout();
  if (phone) return <Activity />;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Sheet"
        description="The year at a glance, and every record underneath. Paste from Google Sheets or Excel on the Transactions tab."
      />
      <SheetTabs />
    </div>
  );
}
