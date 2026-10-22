"use client";

// Building blocks of the phone layout: a bottom sheet with a title and a
// clear way out, list rows, and language names (own name + local name)

import { useCallback, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SONIOX_LANGUAGES } from "@/types/bilingual";
import { useLocale, useT } from "@/lib/i18n";

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  // Tall sheets (language list) take most of the screen
  tall?: boolean;
}

export function BottomSheet({ open, onOpenChange, title, children, tall }: BottomSheetProps) {
  const t = useT();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={`flex flex-col gap-0 rounded-t-2xl p-0 lg:hidden ${tall ? "h-[85dvh]" : "max-h-[85dvh]"}`}
      >
        <div className="flex justify-center pt-2" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="flex items-center justify-between px-5 pb-2 pt-1">
          <SheetTitle className="text-base font-semibold">{title}</SheetTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="-mr-2 rounded-md px-2 py-1 text-sm font-semibold text-blue-700 hover:bg-muted"
          >
            {t("done")}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// A screen sliding in from the side (drawer, settings)
export function SideSheet({
  open,
  onOpenChange,
  side,
  title,
  children,
  className = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: "left" | "right";
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} showCloseButton={false} className={`gap-0 p-0 lg:hidden ${className}`}>
        <VisuallyHidden.Root>
          <SheetTitle>{title}</SheetTitle>
        </VisuallyHidden.Root>
        {children}
      </SheetContent>
    </Sheet>
  );
}

interface RowProps {
  label: ReactNode;
  value?: ReactNode;
  description?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  chevron?: boolean;
  danger?: boolean;
}

// One tappable line: label on the left, current value (and ›) on the right
export function Row({ label, value, description, onClick, disabled, chevron = true, danger }: RowProps) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] ${danger ? "text-destructive" : "text-foreground"}`}>{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-snug text-gray-600">{description}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-sm text-gray-600">{value}</span>}
      {onClick && chevron && <ChevronRight className="size-4 shrink-0 text-gray-400" aria-hidden />}
    </>
  );
  const cls = "flex min-h-12 w-full items-center gap-3 border-b border-border py-2.5 text-left last:border-b-0";
  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${cls} disabled:opacity-50`}>
      {body}
    </button>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="mb-1 mt-5 text-xs font-medium uppercase tracking-wide text-gray-600 first:mt-1">{children}</p>;
}

// A language's own name ("中文") and its name in the interface language
// ("Chinese"), for the big two-line language rows
export function useLangNames() {
  const locale = useLocale();
  const native = useCallback(
    (code: string) => SONIOX_LANGUAGES.find((l) => l.code === code)?.name ?? code.toUpperCase(),
    []
  );
  const local = useCallback(
    (code: string) => {
      try {
        const name = new Intl.DisplayNames([locale], { type: "language" }).of(code);
        if (name && name !== code && name.toLowerCase() !== native(code).toLowerCase()) return name;
      } catch {
        // unknown code / old browser
      }
      return "";
    },
    [locale, native]
  );
  return { native, local };
}

// The meeting language matching the interface language (中文 UI → zh)
export function homeLanguage(locale: string): string {
  return SONIOX_LANGUAGES.some((l) => l.code === locale) ? locale : "zh";
}

// A setting with a few choices, as chips
export function Choice<V extends string>({
  label,
  description,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  value: V;
  options: { value: V; label: string }[];
  disabled?: boolean;
  onChange: (v: V) => void;
}) {
  return (
    <div className="border-b border-border py-3">
      <p className="text-[15px] text-foreground">{label}</p>
      <div role="radiogroup" aria-label={label} className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`rounded-full border px-3 py-1.5 text-sm disabled:opacity-60 ${
              value === o.value ? "border-foreground bg-foreground text-background" : "border-border text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {description && <p className="mt-2 text-xs leading-snug text-gray-600">{description}</p>}
    </div>
  );
}
