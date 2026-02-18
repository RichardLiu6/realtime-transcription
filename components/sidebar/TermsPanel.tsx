"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { X, ChevronDown } from "lucide-react";
import { INDUSTRY_PRESETS } from "@/lib/contextTerms";
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
}

export default function TermsPanel({
  termsText,
  onTermsTextChange,
  selectedPresets,
  onSelectedPresetsChange,
  customTerms,
  onCustomTermsChange,
  isRecording,
}: TermsPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync combined terms to parent whenever presets or custom terms change
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

  const togglePreset = useCallback((key: string) => {
    const next = new Set(selectedPresets);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedPresetsChange(next);
  }, [selectedPresets, onSelectedPresetsChange]);

  const toggleExpand = useCallback((key: string) => {
    setExpandedPreset((prev) => (prev === key ? null : key));
  }, []);

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

  const removeCustomTag = useCallback((index: number) => {
    onCustomTermsChange(customTerms.filter((_, i) => i !== index));
  }, [customTerms, onCustomTermsChange]);

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

  return (
    <div className="px-4 border-b border-border">
      <Accordion type="single" collapsible>
        <AccordionItem value="terms" className="border-b-0">
          <AccordionTrigger className="py-3 hover:no-underline">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Context Terms
              {totalCount > 0 && (
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary normal-case">
                  {totalCount}
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {/* Industry presets */}
            <div className="space-y-1 mb-3">
              {Object.entries(INDUSTRY_PRESETS).map(([key, preset]) => {
                const isSelected = selectedPresets.has(key);
                const isExpanded = expandedPreset === key;

                return (
                  <div key={key}>
                    <div className="flex items-center gap-1.5">
                      {/* Toggle button */}
                      <button
                        type="button"
                        onClick={() => togglePreset(key)}
                        className={`flex-1 text-left rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground font-medium"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {preset.label}
                        {isSelected && (
                          <span className="ml-1.5 opacity-70">
                            ({preset.terms.length})
                          </span>
                        )}
                      </button>
                      {/* Expand chevron */}
                      <button
                        type="button"
                        onClick={() => toggleExpand(key)}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                      >
                        <ChevronDown
                          className={`size-3.5 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </div>
                    {/* Expanded terms list */}
                    {isExpanded && (
                      <div className="mt-1 mb-1 ml-2.5 flex flex-wrap gap-1">
                        {preset.terms.map((term) => (
                          <span
                            key={term}
                            className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {term}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Custom terms input */}
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Custom
              </p>
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
                    customTerms.length === 0 ? "输入术语，回车添加" : ""
                  }
                  className="flex-1 min-w-[60px] bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>
            </div>

            <p className="mt-2 text-[10px] text-muted-foreground">
              {isRecording
                ? "Takes effect on next recording"
                : "Takes effect when recording starts"}
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
