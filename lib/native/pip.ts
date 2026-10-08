"use client";

// Floating captions in the iOS app (native Picture in Picture; see
// mobile/ios/App/App/CaptionPip.swift). The recording hook configures it;
// this gives the page a button: available, showing, start / stop.

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
