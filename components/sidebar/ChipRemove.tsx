"use client";

import { X } from "lucide-react";

// The × on a language chip inside a popover trigger. A span, not the bare
// icon: Button and Badge set pointer-events-none on their svgs, so a click
// on the icon fell through and opened the popover instead of removing.
export default function ChipRemove({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      role="button"
      aria-label={label}
      className="-my-1 -mr-1 ml-0.5 inline-flex cursor-pointer rounded-sm p-1 hover:text-destructive"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemove();
      }}
    >
      <X className="size-3" />
    </span>
  );
}
