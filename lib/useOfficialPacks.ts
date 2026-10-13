"use client";

// Official term packs (published by the admin), shared by every component
// that shows or uses them: one fetch per page load. Empty until loaded,
// without a database, or on failure.

import { useSyncExternalStore } from "react";
import type { TermPack } from "@/lib/termPackTypes";

const NONE: TermPack[] = [];
let packs: TermPack[] = NONE;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load() {
  loading ??= fetch("/api/term-packs/official", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (Array.isArray(d?.packs)) {
        packs = d.packs;
        listeners.forEach((l) => l());
      }
    })
    .catch(() => {});
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  load();
  return () => listeners.delete(onChange);
}

export function useOfficialPacks(): TermPack[] {
  return useSyncExternalStore(subscribe, () => packs, () => NONE);
}
