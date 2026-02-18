"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { X } from "lucide-react";
import { INDUSTRY_PRESETS } from "@/lib/contextTerms";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

interface TermsPanelProps {
  termsText: string;
  onTermsTextChange: (text: string) => void;
  isRecording: boolean;
}

export default function TermsPanel({
  termsText,
  onTermsTextChange,
  isRecording,
}: TermsPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = useMemo(
    () =>
      termsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [termsText]
  );

  const setTags = useCallback(
    (newTags: string[]) => {
      onTermsTextChange(newTags.join(", "));
    },
    [onTermsTextChange]
  );

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed) return;
      // Avoid duplicates (case-insensitive)
      if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return;
      setTags([...tags, trimmed]);
    },
    [tags, setTags]
  );

  const removeTag = useCallback(
    (index: number) => {
      setTags(tags.filter((_, i) => i !== index));
    },
    [tags, setTags]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
      setInputValue("");
    }
    if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (pasted.includes(",")) {
      e.preventDefault();
      const newTerms = pasted.split(",").map((t) => t.trim()).filter(Boolean);
      for (const term of newTerms) addTag(term);
      setInputValue("");
    }
  };

  const appendPresetTerms = (key: string) => {
    const preset = INDUSTRY_PRESETS[key];
    if (!preset) return;
    const newTags = [...tags];
    for (const term of preset.terms) {
      if (!newTags.some((t) => t.toLowerCase() === term.toLowerCase())) {
        newTags.push(term);
      }
    }
    setTags(newTags);
  };

  return (
    <div className="px-4 border-b border-border">
      <Accordion type="single" collapsible>
        <AccordionItem value="terms" className="border-b-0">
          <AccordionTrigger className="py-3 hover:no-underline">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Context Terms
              {tags.length > 0 && (
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary normal-case">
                  {tags.length}
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {/* Industry presets */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {Object.entries(INDUSTRY_PRESETS).map(([key, preset]) => (
                <Button
                  key={key}
                  variant="outline"
                  size="xs"
                  onClick={() => appendPresetTerms(key)}
                  className="rounded-full"
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            {/* Tag input area */}
            <div
              className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-2 min-h-[2.5rem] cursor-text focus-within:border-ring focus-within:ring-1 focus-within:ring-ring"
              onClick={() => inputRef.current?.focus()}
            >
              {tags.map((tag, i) => (
                <span
                  key={`${tag}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTag(i);
                    }}
                    className="text-primary/60 hover:text-primary"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onBlur={() => {
                  if (inputValue.trim()) {
                    addTag(inputValue);
                    setInputValue("");
                  }
                }}
                placeholder={tags.length === 0 ? "输入术语，回车添加" : ""}
                className="flex-1 min-w-[80px] bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>

            <p className="mt-1.5 text-xs text-muted-foreground">
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
