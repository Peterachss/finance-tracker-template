"use client";

import { useEffect, type ReactNode } from "react";
import { WorkspaceProvider } from "@/lib/store";

/** Client-side context shared by every page. */
export function Providers({ children }: { children: ReactNode }) {
  // Offline support (public/sw.js); production only, so development never caches.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Unsupported or blocked: the app simply works online only.
    });
  }, []);

  // iOS Safari still pinch-zooms despite the viewport; cancel its gesture events.
  useEffect(() => {
    const stop = (event: Event) => event.preventDefault();
    document.addEventListener("gesturestart", stop, { passive: false });
    document.addEventListener("gesturechange", stop, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
    };
  }, []);

  // New version live? Reload when the app comes back into view, so fixes
  // arrive without a manual hard refresh. Skipped while offline or in dev.
  useEffect(() => {
    const built = process.env.NEXT_PUBLIC_BUILD_SHA;
    if (!built) return;
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== "visible" || !navigator.onLine) return;
      checking = true;
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        const { sha } = (await response.json()) as { sha?: string };
        if (sha && sha !== "dev" && sha !== built) window.location.reload();
      } catch {
        // Offline or blocked: try again next time.
      } finally {
        checking = false;
      }
    };
    document.addEventListener("visibilitychange", check);
    const timer = setInterval(check, 5 * 60_000);
    return () => {
      document.removeEventListener("visibilitychange", check);
      clearInterval(timer);
    };
  }, []);

  return (
    <WorkspaceProvider>
      {children}
    </WorkspaceProvider>
  );
}