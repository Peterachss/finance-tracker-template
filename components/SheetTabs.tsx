"use client";

import { useEffect, useState } from "react";
import { Spreadsheet } from "@/components/Spreadsheet";
import { YearSheet } from "@/components/YearSheet";
import { SheetTitle } from "@/components/sheet";

const TABS = [
  { id: "year", label: "Expense tracker" },
  { id: "records", label: "Transactions" },
] as const;

/** Two sheets in one workbook, switched by Sheets-style tabs. */
export function SheetTabs() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("year");

  // Links that filter the grid (?q=…) or hand over an import land on the records sheet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("q") || params.has("import")) {
      const timer = setTimeout(() => setTab("records"), 0);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Sheets" className="flex gap-1 border-b border-[var(--sheet-grid)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px rounded-t-[8px] border px-4 py-2 text-[13px] font-medium transition-colors ${
              tab === t.id
                ? "border-[var(--sheet-grid)] border-b-[var(--bg)] bg-[var(--bg)] text-[var(--accent)] shadow-[inset_0_2px_0_var(--accent)]"
                : "border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "year" ? (
        <YearSheet />
      ) : (
        <>
          <SheetTitle title="Transactions" subtitle="Every record. Edit cells like Google Sheets, or paste and import blocks from Excel." />
          <Spreadsheet />
        </>
      )}
    </div>
  );
}
