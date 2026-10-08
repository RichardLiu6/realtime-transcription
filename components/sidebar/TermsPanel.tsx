"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { X, Info, Sparkles, Trash2 } from "lucide-react";
import { INDUSTRY_PRESETS, combineTerms, presetLabel, splitTermInput } from "@/lib/contextTerms";
import { useLocale, useT } from "@/lib/i18n";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AiTerms } from "@/components/phone/PhoneTerms";
import { deleteTermPack, useTermPacks } from "@/lib/useTermPacks";
import { USER_PACK_PREFIX } from "@/lib/termPackTypes";
import { homeLanguage } from "@/components/phone/parts";
import { meetingLanguagesOf } from "@/lib/phoneModes";
import type { TranslationMode } from "@/types/bilingual";
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
  /** The meeting's settings: enables AI-suggested terms in its languages */
  meeting?: { translationMode: TranslationMode; languageA: string[]; languageB: string; targetLangs: string[] };
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
  meta,
  onDelete,
}: {
  presetKey: string;
  label: string;
  terms: string[];
  isSelected: boolean;
  onToggle: () => void;
  // Own packs: "N terms · langs · date" and a delete action
  meta?: string;
  onDelete?: () => void;
}) {
  const t = useT();
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
          <span>{label}</span>
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

      {/* A preset can hold 100+ terms: cap the height and scroll */}
      <PopoverContent
        side="top"
        align="start"
        collisionPadding={8}
        className="w-64 max-h-[min(20rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain p-2"
      >
        <p className="text-xs font-medium">{label}</p>
        {meta && <p className="text-[10px] text-muted-foreground">{meta}</p>}
        <div className="mb-1.5" />
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
        {onDelete && (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(t("ph_delete_pack_confirm"))) return;
              setInfoOpen(false);
              onDelete();
            }}
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-red-700 hover:underline"
          >
            <Trash2 className="size-3" aria-hidden />
            {t("ph_delete_pack")}
          </button>
        )}
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
  meeting,
}: TermsPanelProps) {
  const t = useT();
  const locale = useLocale();
  const [aiOpen, setAiOpen] = useState(false);
  const meetingLanguages = useMemo(
    () =>
      meeting
        ? meetingLanguagesOf(meeting.translationMode, meeting.languageA, meeting.languageB, meeting.targetLangs, homeLanguage(locale))
        : [],
    [meeting, locale]
  );
  const { packs } = useTermPacks();
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync combined terms to parent
  useEffect(() => {
    onTermsTextChange(combineTerms(selectedPresets, customTerms, packs).join(", "));
  }, [selectedPresets, customTerms, packs, onTermsTextChange]);

  const totalCount = useMemo(
    () => combineTerms(selectedPresets, customTerms, packs).length,
    [selectedPresets, customTerms, packs]
  );

  const togglePreset = useCallback(
    (key: string) => {
      const next = new Set(selectedPresets);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onSelectedPresetsChange(next);
    },
    [selectedPresets, onSelectedPresetsChange]
  );

  // One entry may hold several terms ("千问=Qwen，硬胶囊=hard capsule", a
  // pasted list): each becomes its own tag
  const addCustomTag = useCallback(
    (input: string) => {
      const next = [...customTerms];
      for (const term of splitTermInput(input)) {
        if (!next.some((t) => t.toLowerCase() === term.toLowerCase())) next.push(term);
      }
      if (next.length !== customTerms.length) onCustomTermsChange(next);
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
    if (e.key === "Enter" || e.key === "," || e.key === "，" || e.key === "、") {
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
            label={presetLabel(key, preset.label, t)}
            terms={preset.terms}
            isSelected={selectedPresets.has(key)}
            onToggle={() => togglePreset(key)}
          />
        ))}
        {/* Own packs (AI-generated, saved per user) */}
        {packs.map((pack) => {
          const key = USER_PACK_PREFIX + pack.id;
          return (
            <PresetChip
              key={key}
              presetKey={key}
              label={pack.name}
              terms={pack.terms}
              meta={t("ph_pack_meta", {
                n: pack.terms.length,
                langs: pack.languages.map((l) => l.toUpperCase()).join("/"),
                date: new Date(pack.createdAt).toLocaleDateString(locale),
              })}
              isSelected={selectedPresets.has(key)}
              onToggle={() => togglePreset(key)}
              onDelete={async () => {
                if (await deleteTermPack(pack.id)) {
                  const next = new Set(selectedPresets);
                  next.delete(key);
                  onSelectedPresetsChange(next);
                }
              }}
            />
          );
        })}
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

      {meeting && (
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          data-ai-terms-open
          className="mt-2 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
        >
          <Sparkles className="size-3.5" aria-hidden />
          {t("ph_ai_title")}
        </button>
      )}

      <p className="mt-2 text-[10px] text-muted-foreground">
        {isRecording
          ? t("terms_effect_next")
          : t("terms_effect_start")}
      </p>

      {meeting && (
        <Sheet open={aiOpen} onOpenChange={setAiOpen}>
          <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle>{t("ph_ai_title")}</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-6 [&_[data-ai-terms]]:mt-0 [&_[data-ai-terms]]:border-0 [&_[data-ai-terms]]:p-0 [&_[data-ai-terms]>h3]:hidden">
              <AiTerms
                key={meetingLanguages.join(",")}
                meetingLanguages={meetingLanguages}
                onAdd={(terms) => {
                  addCustomTag(terms.join("\n"));
                  setAiOpen(false);
                }}
                onSaved={(pack) => {
                  onSelectedPresetsChange(new Set([...selectedPresets, USER_PACK_PREFIX + pack.id]));
                  setAiOpen(false);
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );

  if (inline) {
    return <div className="px-3 py-2">{content}</div>;
  }

  return (
    <div className="px-4 border-b border-border">
      <Accordion type="single" collapsible defaultValue="terms">
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
