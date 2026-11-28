"use client";

import { useStoredState } from "@/lib/useStoredState";

// The round button that stands in for the collapsed sidebar (desktop): shown,
// faded until the pointer is on it, or hidden (the sidebar's open button in
// the status bar, or ⌘\ / Ctrl+\, brings the controls back). localStorage
// `fabStyle`.
export type FabStyle = "solid" | "faded" | "hidden";
export const FAB_STYLES: FabStyle[] = ["solid", "faded", "hidden"];
const isFabStyle = (v: unknown): v is FabStyle => v === "solid" || v === "faded" || v === "hidden";
export const FAB_STYLE_LABEL = { solid: "fab_solid", faded: "fab_faded", hidden: "fab_hidden" } as const;

export function useFabStyle(): [FabStyle, (style: FabStyle) => void] {
  return useStoredState<FabStyle>("fabStyle", "solid", isFabStyle);
}
