"use client";

import { useSyncExternalStore } from "react";

// Whether this account may generate terms with AI (admin-granted, see
// canUseAiTerms). Read once from /api/auth/me and shared by every terms
// panel; false until known (and on the server).
let allowed = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load() {
  loading ??= fetch("/api/auth/me")
    .then((r) => r.json())
    .then((d) => {
      allowed = d?.aiTerms === true;
      listeners.forEach((l) => l());
    })
    .catch(() => {});
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  load();
  return () => listeners.delete(onChange);
}

export function useAiTermsAllowed(): boolean {
  return useSyncExternalStore(subscribe, () => allowed, () => false);
}
