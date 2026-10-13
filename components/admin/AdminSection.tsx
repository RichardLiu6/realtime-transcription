"use client";

// One admin page section: a card filling the space it gets (the admin page
// shows one section at a time), its body scrolling inside. Title, count, an
// ⓘ with the explanation (hover) and actions share one header line.

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminSection({
  title,
  count,
  info,
  actions,
  footer,
  children,
  className,
  bodyClassName,
  ...rest
}: {
  title: string;
  count?: number | string;
  info?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
} & Record<`data-${string}`, unknown>) {
  return (
    <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-border bg-background", className)} {...rest}>
      <header className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-3 py-1.5">
        <h2 className="text-sm font-semibold">
          {title}
          {count !== undefined && <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{count}</span>}
        </h2>
        {info && (
          <span title={info} aria-label={info} className="text-muted-foreground">
            <Info className="size-3.5" />
          </span>
        )}
        {actions && <div className="ml-auto flex min-w-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-auto", bodyClassName)}>{children}</div>
      {footer && <footer className="border-t border-border px-3 py-1.5 text-[11px] leading-snug text-muted-foreground">{footer}</footer>}
    </section>
  );
}

// Empty state inside a section body
export function AdminEmpty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
