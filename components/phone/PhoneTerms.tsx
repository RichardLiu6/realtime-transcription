"use client";

// Terms on the phone: one row per industry pack (name, count, a preview of
// its terms; tap the row to turn it on, "Show all" to read them), then your
// own terms with an Add button. Same state as the desktop TermsPanel.

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { INDUSTRY_PRESETS, combineTerms, presetLabel, splitTermInput } from "@/lib/contextTerms";
import { useT } from "@/lib/i18n";
import { SectionTitle } from "./parts";

interface PhoneTermsProps {
  onTermsTextChange: (text: string) => void;
  selectedPresets: Set<string>;
  onSelectedPresetsChange: (presets: Set<string>) => void;
  customTerms: string[];
  onCustomTermsChange: (terms: string[]) => void;
  isRecording: boolean;
}

export default function PhoneTerms({
  onTermsTextChange,
  selectedPresets,
  onSelectedPresetsChange,
  customTerms,
  onCustomTermsChange,
  isRecording,
}: PhoneTermsProps) {
  const t = useT();
  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  // Terms every pack has (company and brand names) say nothing about a
  // pack: left out of the two-line preview, shown under "Show all"
  const common = useMemo(() => {
    const packs = Object.values(INDUSTRY_PRESETS).map((p) => new Set(p.terms));
    return new Set(packs.length ? [...packs[0]].filter((term) => packs.every((p) => p.has(term))) : []);
  }, []);

  // Keep the combined list in the page state, as the desktop panel does
  useEffect(() => {
    onTermsTextChange(combineTerms(selectedPresets, customTerms).join(", "));
  }, [selectedPresets, customTerms, onTermsTextChange]);

  const toggle = (key: string) => {
    const next = new Set(selectedPresets);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedPresetsChange(next);
  };

  const add = () => {
    const next = [...customTerms];
    for (const term of splitTermInput(input)) {
      if (!next.some((x) => x.toLowerCase() === term.toLowerCase())) next.push(term);
    }
    if (next.length !== customTerms.length) onCustomTermsChange(next);
    setInput("");
  };

  return (
    <div className="pb-2">
      <SectionTitle>{t("ph_term_packs")}</SectionTitle>
      <ul className="space-y-2">
        {Object.entries(INDUSTRY_PRESETS).map(([key, preset]) => {
          const on = selectedPresets.has(key);
          const open = expanded === key;
          return (
            <li
              key={key}
              className={`rounded-2xl border transition-colors ${on ? "border-foreground bg-muted/50" : "border-border"}`}
            >
              <button
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => toggle(key)}
                className="flex w-full items-center gap-3 px-4 pt-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-foreground">
                    {presetLabel(key, preset.label, t)}
                  </span>
                  <span className="block text-xs text-gray-600">{t("ph_n_terms", { n: preset.terms.length })}</span>
                </span>
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                    on ? "border-foreground bg-foreground text-background" : "border-gray-300"
                  }`}
                  aria-hidden
                >
                  {on && <Check className="size-4" />}
                </span>
              </button>
              <div className="px-4 pb-3 pt-1.5">
                <p className={`text-[13px] leading-relaxed text-gray-700 ${open ? "" : "line-clamp-2"}`}>
                  {(open ? preset.terms : preset.terms.filter((term) => !common.has(term))).join(" · ")}
                </p>
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : key)}
                  className="mt-1 text-[13px] font-medium text-blue-700"
                >
                  {open ? t("ph_hide") : t("ph_show_all")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <SectionTitle>{t("ph_custom_terms")}</SectionTitle>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          // Typed but not added (closed the sheet): keep it
          onBlur={() => {
            if (input.trim()) add();
          }}
          placeholder={t("ph_custom_placeholder")}
          enterKeyHint="done"
          autoCapitalize="off"
          autoCorrect="off"
          className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-base outline-none focus:border-ring"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="inline-flex h-11 shrink-0 items-center gap-1 rounded-xl bg-foreground px-4 text-[15px] font-semibold text-background disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden />
          {t("ph_add")}
        </button>
      </form>
      <p className="mt-2 text-xs leading-snug text-gray-600">{t("ph_custom_hint")}</p>
      {customTerms.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {customTerms.map((term, i) => (
            <li key={`${term}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-sm">
              <span className="max-w-[60vw] truncate">{term}</span>
              <button
                type="button"
                aria-label={t("ph_remove_term", { name: term })}
                onClick={() => onCustomTermsChange(customTerms.filter((_, j) => j !== i))}
                className="grid size-6 place-items-center rounded-full text-gray-600 hover:bg-background"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-gray-600">{isRecording ? t("terms_effect_next") : t("terms_effect_start")}</p>
    </div>
  );
}
