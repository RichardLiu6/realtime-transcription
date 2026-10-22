"use client";

// Floating captions in the iOS app (native Picture in Picture; see
// mobile/ios/App/App/CaptionPip.swift). The recording hook configures it;
// this gives the page a button (available, showing, start / stop) and the
// user's display choices (font size, share of the original), kept per device.

import { useEffect, useState, useSyncExternalStore } from "react";
import { nativeStt } from "@/lib/native/stt";

// Set by the recording hook from pipConfigure's answer (iPads without PiP,
// R2T2 recordings: no button)
let supported = false;
const listeners = new Set<() => void>();

export function setPipSupported(value: boolean) {
  if (supported === value) return;
  supported = value;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function pipAvailable(): boolean {
  return supported && typeof nativeStt()?.pipStart === "function";
}

export function usePip(): { available: boolean; active: boolean; start: () => void; stop: () => void } {
  // Not on the server (no app there): false, then the real answer
  const available = useSyncExternalStore(subscribe, pipAvailable, () => false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const plugin = nativeStt();
    if (!plugin?.pipStart) return;
    let listener: { remove: () => Promise<void> | void } | null = null;
    let gone = false;
    // A promise in some Capacitor versions, the handle itself in others
    void Promise.resolve(plugin.addListener("pip", (e) => setActive(e.active))).then((l) => {
      if (gone) void l.remove();
      else listener = l;
    });
    return () => {
      gone = true;
      void listener?.remove();
    };
  }, []);

  return {
    available,
    active,
    start: () => void nativeStt()?.pipStart?.(),
    stop: () => void nativeStt()?.pipStop?.(),
  };
}

// The user's choices for the window (localStorage "pipPrefs")
export interface PipPrefs {
  // 0 小 · 1 中 · 2 大 · 3 特大
  fontSize: 0 | 1 | 2 | 3;
  // Share of the height for the original: 0 = not shown
  originalShare: 0 | 0.2 | 0.4;
}

const DEFAULT_PREFS: PipPrefs = { fontSize: 1, originalShare: 0 };
const prefsListeners = new Set<() => void>();
let prefs: PipPrefs | null = null;

export function getPipPrefs(): PipPrefs {
  if (prefs) return prefs;
  prefs = DEFAULT_PREFS;
  try {
    const stored = JSON.parse(localStorage.getItem("pipPrefs") ?? "null") as Partial<PipPrefs> | null;
    if (stored) {
      prefs = {
        fontSize: [0, 1, 2, 3].includes(stored.fontSize as number) ? (stored.fontSize as PipPrefs["fontSize"]) : 1,
        originalShare: [0, 0.2, 0.4].includes(stored.originalShare as number)
          ? (stored.originalShare as PipPrefs["originalShare"])
          : 0,
      };
    }
  } catch {
    // no storage: defaults
  }
  return prefs;
}

// Saved, and applied to an open window at once
export function setPipPrefs(next: PipPrefs) {
  prefs = next;
  try {
    localStorage.setItem("pipPrefs", JSON.stringify(next));
  } catch {
    // not saved; still applied
  }
  void nativeStt()?.pipPrefs?.(next);
  for (const l of prefsListeners) l();
}

export function usePipPrefs(): PipPrefs {
  return useSyncExternalStore(
    (l) => {
      prefsListeners.add(l);
      return () => {
        prefsListeners.delete(l);
      };
    },
    getPipPrefs,
    () => DEFAULT_PREFS
  );
}

// Whether this app build has floating captions (the settings row)
export function pipInApp(): boolean {
  return typeof nativeStt()?.pipPrefs === "function";
}

// How translation went in the window (for feedback); {} when unknown
export async function pipStats(): Promise<Record<string, unknown>> {
  try {
    return (await nativeStt()?.pipStats?.()) ?? {};
  } catch {
    return {};
  }
}
