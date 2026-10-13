"use client";

// Language pickers with search: a query in English, Chinese, Spanish or
// Vietnamese (or the code) finds the language whatever the interface
// language (lib/languageSearch.ts).
//
// LanguageSearchInput: the box on top of a language list (multi-pick
// popovers filter their own lists with languageMatches).
// LanguageSelect: a single-pick dropdown that looks like the shadcn Select
// it replaces, with the search box inside.

import { useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SONIOX_LANGUAGES } from "@/types/bilingual";
import { languageMatches } from "@/lib/languageSearch";
import { useLanguageName, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageSearchInput({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  // Enter picks the first match
  onEnter?: () => void;
}) {
  const t = useT();
  return (
    <label className="flex items-center gap-2 border-b border-border px-3 py-2">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        type="search"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        placeholder={t("search_languages")}
        aria-label={t("search_languages")}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

export function NoLanguageMatch() {
  const t = useT();
  return <p className="px-3 py-3 text-sm text-muted-foreground">{t("lang_no_match")}</p>;
}

export default function LanguageSelect({
  value,
  onChange,
  disabled,
  disabledCodes = [],
  anyOption = false,
  className,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  // Shown but not selectable (the other side of a pair)
  disabledCodes?: string[];
  // Offer "*" (any language) first
  anyOption?: boolean;
  className?: string;
}) {
  const t = useT();
  const langName = useLanguageName();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const label = (code: string) => (code === "*" ? t("any_language") : langName(code));

  const options = useMemo(() => {
    const codes = SONIOX_LANGUAGES.map((l) => l.code).filter((c) => languageMatches(c, query));
    return anyOption && !query.trim() ? ["*", ...codes] : codes;
  }, [query, anyOption]);

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          className={cn(
            "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 flex h-9 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <span className="min-w-0 truncate">{label(value)}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <LanguageSearchInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            listRef.current?.scrollTo({ top: 0 });
          }}
          onEnter={() => {
            const first = options.find((c) => !disabledCodes.includes(c));
            if (first) pick(first);
          }}
        />
        <div ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
          {options.length === 0 && <NoLanguageMatch />}
          {options.map((code) => {
            const off = disabledCodes.includes(code);
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={code === value}
                disabled={off}
                onClick={() => pick(code)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check className={cn("size-4 shrink-0", code === value ? "opacity-100" : "opacity-0")} aria-hidden />
                <span className="min-w-0 truncate">{label(code)}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// "+ Add language": a button (styled by the caller) opening the searchable
// list of the languages not in `exclude`
export function AddLanguageButton({
  exclude,
  onAdd,
  disabled,
  className,
  children,
}: {
  exclude: string[];
  onAdd: (code: string) => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const langName = useLanguageName();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = SONIOX_LANGUAGES.map((l) => l.code).filter((c) => !exclude.includes(c) && languageMatches(c, query));
  const add = (code: string) => {
    onAdd(code);
    setOpen(false);
    setQuery("");
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} className={className}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <LanguageSearchInput value={query} onChange={setQuery} onEnter={() => options[0] && add(options[0])} />
        <div className="max-h-64 overflow-y-auto py-1">
          {options.length === 0 && <NoLanguageMatch />}
          {options.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => add(code)}
              className="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent"
            >
              {langName(code)}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
