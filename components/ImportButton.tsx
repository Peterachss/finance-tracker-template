"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

/** Hand-off key: the file text waits here while the Sheet page opens. */
export const IMPORT_KEY = "ft-import-text";

/**
 * Pick a CSV (exported from Excel or Google Sheets) or a TSV/TXT file. The
 * text is handed to the Transactions sheet, which shows the import preview so
 * every row is checked before anything is saved.
 */
export function ImportButton({ className = "", onText }: { className?: string; onText?: (text: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    if (input.current) input.current.value = "";
    if (onText) return onText(text);
    try {
      sessionStorage.setItem(IMPORT_KEY, text);
    } catch {
      // Storage blocked: the sheet's own Import button still works.
    }
    router.push("/spreadsheet?import=1");
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <button type="button" onClick={() => input.current?.click()} className={className}>
        <Upload className="size-4" strokeWidth={1.75} aria-hidden="true" />
        Import
      </button>
    </>
  );
}
