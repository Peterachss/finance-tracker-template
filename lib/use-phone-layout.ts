"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const query = window.matchMedia("(max-width: 767px)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Matches the phone layout without changing stored accounts or transactions. */
export function usePhoneLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia("(max-width: 767px)").matches, () => false);
}
