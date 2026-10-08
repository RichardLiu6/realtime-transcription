"use client";

// The user's own term packs, shared by every component that shows or uses
// them (one fetch per page load). Guests and servers without a database:
// `available` false.

import { useEffect, useSyncExternalStore } from "react";
import type { TermPack } from "@/lib/termPackTypes";

interface State {
  loaded: boolean;
  available: boolean;
  max: number;
  packs: TermPack[];
}

const EMPTY: State = { loaded: false, available: false, max: 3, packs: [] };
let state: State = EMPTY;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function refreshTermPacks(): Promise<void> {
  loading ??= fetch("/api/term-packs", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (d) set({ loaded: true, available: !!d.available, max: d.max ?? 3, packs: d.packs ?? [] });
      else set({ ...state, loaded: true });
    })
    .catch(() => set({ ...state, loaded: true }))
    .finally(() => {
      loading = null;
    });
  return loading;
}

export type CreateResult = { pack: TermPack } | { error: "limit" | "failed" };

export async function createTermPack(
  name: string,
  languages: string[],
  terms: string[],
  replaceId?: string
): Promise<CreateResult> {
  const r = await fetch("/api/term-packs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, languages, terms, replaceId }),
  }).catch(() => null);
  if (r?.status === 409) {
    // Full (packs saved on another device): reload so the replace choice shows them
    await refreshTermPacks();
    return { error: "limit" };
  }
  if (!r?.ok) return { error: "failed" };
  const { pack } = (await r.json()) as { pack: TermPack };
  set({ ...state, packs: [...state.packs.filter((p) => p.id !== replaceId), pack] });
  return { pack };
}

export async function renameTermPack(id: string, name: string): Promise<boolean> {
  const r = await fetch(`/api/term-packs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).catch(() => null);
  if (!r?.ok) return false;
  set({ ...state, packs: state.packs.map((p) => (p.id === id ? { ...p, name } : p)) });
  return true;
}

export async function deleteTermPack(id: string): Promise<boolean> {
  const r = await fetch(`/api/term-packs/${id}`, { method: "DELETE" }).catch(() => null);
  if (!r?.ok) return false;
  set({ ...state, packs: state.packs.filter((p) => p.id !== id) });
  return true;
}

export function useTermPacks(): State {
  const s = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  useEffect(() => {
    if (!state.loaded) void refreshTermPacks();
  }, []);
  return s;
}
