"use client";

import { useEffect } from "react";

// Registers /sw.js (production only: in development it would get in the
// way of hot reloading)
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
