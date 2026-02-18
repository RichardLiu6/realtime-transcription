"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { X, Info } from "lucide-react";
import { INDUSTRY_PRESETS } from "@/lib/contextTerms";
import { useT } from "@/lib/i18n";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface TermsPanelProps {
  termsText: string;
  onTermsTextChange: (text: string) => void;
  selectedPresets: Set<string>;
  onSelectedPresetsChange: (presets: Set<string>) => void;
  customTerms: string[];
  onCustomTermsChange: (terms: string[]) => void;
  isRecording: boolean;
  /** When true, render content directly without Accordion wrapper */
  inline?: boolean;
}

/** Hook: long-press detection for mobile */
function useLongPress(callback: () => void, ms = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const start = useCallback(() => {
    timerRef.current = setTimeout(() => callbackRef.current(), ms);
  }, [ms]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
  };
}

function PresetChip({
  presetKey,
  label,
  terms,
  isSelected,
  onToggle,
}: {
  presetKey: string;
  label: string;
  terms: string[];
  isSelected: boolean;
  onToggle: () => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const longPress = useLongPress(() => setInfoOpen(true));

  return (
    <Popover open={infoOpen} onOpenChange={setInfoOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            // Click the (i) area → open info; click elsewhere → toggle
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            if (clickX > rect.width - 24) {
              setInfoOpen(true);
            } else {
              onToggle();
            }
          }}
          {...longPress}
          onContextMenu={(e) => {
            e.preventDefault();
            setInfoOpen(true);
          }}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] leading-tight transition-colors ${
            isSelected
              ? "bg-primary text-primary-foreground font-medium"
              : "bg-muted/60 text-muted-foreground hover:bg-muted"
          }`}
        >
          <span>{label.split(" ")[0]}</span>
          {isSelected && (
            <span className="opacity-70 text-[10px]">{terms.length}</span>
          )}
          <Info
            className={`size-3 shrink-0 ${
              isSelected
                ? "text-primary-foreground/50"
                : "text-muted-foreground/40"
            }`}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent side="top" align="start" className="w-56 p-2">
        <p className="text-xs font-medium mb-1.5">{label}</p>
        <div className="flex flex-wrap gap-1">
          {terms.map((term) => (
            <span
              key={term}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {term}
            </span>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function TermsPanel({
  termsText,
  onTermsTextChange,
  selectedPresets,
  onSelectedPresetsChange,
  customTerms,
  onCustomTermsChange,
  isRecording,
  inline = false,
}: TermsPanelProps) {
  const t = useT();
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync combined terms to parent
  useEffect(() => {
    const presetTerms = Array.from(selectedPresets).flatMap(
      (key) => INDUSTRY_PRESETS[key]?.terms ?? []
    );
    const all = [...new Set([...presetTerms, ...customTerms])];
    onTermsTextChange(all.join(", "));
  }, [selectedPresets, customTerms, onTermsTextChange]);

  const totalCount = useMemo(() => {
    const presetTerms = Array.from(selectedPresets).flatMap(
      (key) => INDUSTRY_PRESETS[key]?.terms ?? []
    );
    return new Set([...presetTerms, ...customTerms]).size;
  }, [selectedPresets, customTerms]);

  const togglePreset = useCallback(
    (key: string) => {
      const next = new Set(selectedPresets);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onSelectedPresetsChange(next);
    },
    [selectedPresets, onSelectedPresetsChange]
  );

  const addCustomTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed) return;
      if (customTerms.some((t) => t.toLowerCase() === trimmed.toLowerCase()))
        return;
      onCustomTermsChange([...customTerms, trimmed]);
    },
    [customTerms, onCustomTermsChange]
  );

  const removeCustomTag = useCallback(
    (index: number) => {
      onCustomTermsChange(customTerms.filter((_, i) => i !== index));
    },
    [customTerms, onCustomTermsChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addCustomTag(inputValue);
      setInputValue("");
    }
    if (e.key === "Backspace" && !inputValue && customTerms.length > 0) {
      removeCustomTag(customTerms.length - 1);
    }
  };

  const content = (
    <>
      {/* Chip grid */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {Object.entries(INDUSTRY_PRESETS).map(([key, preset]) => (
          <PresetChip
            key={key}
            presetKey={key}
            label={preset.label}
            terms={preset.terms}
            isSelected={selectedPresets.has(key)}
            onToggle={() => togglePreset(key)}
          />
        ))}
      </div>

      {/* Custom terms */}
      <div
        className="flex flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1.5 min-h-[2rem] cursor-text focus-within:border-ring focus-within:ring-1 focus-within:ring-ring"
        onClick={() => inputRef.current?.focus()}
      >
        {customTerms.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeCustomTag(i);
              }}
              className="text-primary/60 hover:text-primary"
            >
              <X className="size-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue.trim()) {
              addCustomTag(inputValue);
              setInputValue("");
            }
          }}
          placeholder={
            customTerms.length === 0 ? t("add_term_placeholder") : ""
          }
          className="flex-1 min-w-[60px] bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
        />
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground">
        {isRecording
          ? t("terms_effect_next")
          : t("terms_effect_start")}
      </p>
    </>
  );

  if (inline) {
    return <div className="px-3 py-2">{content}</div>;
  }

  return (
    <div className="px-4 border-b border-border">
      <Accordion type="single" collapsible>
        <AccordionItem value="terms" className="border-b-0">
          <AccordionTrigger className="py-3 hover:no-underline">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("context_terms")}
              {totalCount > 0 && (
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary normal-case">
                  {totalCount}
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent>{content}</AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
