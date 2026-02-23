"use client";

import { ArrowDown, Check, ChevronsUpDown, X } from "lucide-react";
import { SONIOX_LANGUAGES } from "@/types/bilingual";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useT } from "@/lib/i18n";

interface PresentationLanguagesProps {
  languageA: string[];
  targetLangs: string[];
  onLanguageAChange: (codes: string[]) => void;
  onTargetLangsChange: (codes: string[]) => void;
  disabled?: boolean;
}

export default function PresentationLanguages({
  languageA,
  targetLangs,
  onLanguageAChange,
  onTargetLangsChange,
  disabled,
}: PresentationLanguagesProps) {
  const t = useT();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);

  const isAny = languageA.length === 1 && languageA[0] === "*";

  const toggleSource = (code: string) => {
    if (code === "*") {
      onLanguageAChange(["*"]);
      return;
    }
    const withoutAny = languageA.filter((c) => c !== "*");
    if (withoutAny.includes(code)) {
      const next = withoutAny.filter((c) => c !== code);
      onLanguageAChange(next.length === 0 ? ["*"] : next);
    } else {
      onLanguageAChange([...withoutAny, code]);
    }
  };

  const removeSource = (code: string) => {
    const next = languageA.filter((c) => c !== code && c !== "*");
    onLanguageAChange(next.length === 0 ? ["*"] : next);
  };

  const toggleTarget = (code: string) => {
    if (targetLangs.includes(code)) {
      const next = targetLangs.filter((c) => c !== code);
      if (next.length > 0) onTargetLangsChange(next);
    } else {
      onTargetLangsChange([...targetLangs, code]);
    }
  };

  const removeTarget = (code: string) => {
    const next = targetLangs.filter((c) => c !== code);
    if (next.length > 0) onTargetLangsChange(next);
  };

  const getName = (code: string) => {
    if (code === "*") return t("any_language");
    return SONIOX_LANGUAGES.find((l) => l.code === code)?.name ?? code;
  };

  return (
    <div className="px-4 py-3 border-b border-border">
      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {t("languages")}
      </p>

      <div className="space-y-2">
        {/* Source languages (multi-select with Any) */}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("source_language")}
          </label>
          <Popover open={sourceOpen} onOpenChange={setSourceOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal h-auto min-h-9"
                disabled={disabled}
              >
                <div className="flex flex-wrap gap-1 flex-1 text-left">
                  {isAny ? (
                    <span className="text-sm">{t("any_language")}</span>
                  ) : (
                    languageA.map((code) => (
                      <Badge key={code} variant="secondary" className="text-xs px-1.5 py-0 h-5">
                        {getName(code)}
                        {!disabled && (
                          <X
                            className="size-3 ml-0.5 cursor-pointer hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); removeSource(code); }}
                          />
                        )}
                      </Badge>
                    ))
                  )}
                </div>
                <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
              <div className="max-h-64 overflow-y-auto">
                <button
                  type="button"
                  className={cn("flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent cursor-pointer", isAny && "bg-accent")}
                  onClick={() => toggleSource("*")}
                >
                  <Check className={cn("size-4 shrink-0", isAny ? "opacity-100" : "opacity-0")} />
                  {t("any_language")}
                </button>
                <div className="h-px bg-border" />
                {SONIOX_LANGUAGES.map((lang) => {
                  const selected = !isAny && languageA.includes(lang.code);
                  return (
                    <button
                      type="button"
                      key={lang.code}
                      className={cn("flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent cursor-pointer", selected && "bg-accent")}
                      onClick={() => toggleSource(lang.code)}
                    >
                      <Check className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                      {lang.name}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex justify-center">
          <ArrowDown className="size-4 text-muted-foreground" />
        </div>

        {/* Target languages (multi-select, no Any, at least 1) */}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("target_languages")}
          </label>
          <Popover open={targetOpen} onOpenChange={setTargetOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal h-auto min-h-9"
                disabled={disabled}
              >
                <div className="flex flex-wrap gap-1 flex-1 text-left">
                  {targetLangs.map((code) => (
                    <Badge key={code} variant="secondary" className="text-xs px-1.5 py-0 h-5">
                      {getName(code)}
                      {!disabled && targetLangs.length > 1 && (
                        <X
                          className="size-3 ml-0.5 cursor-pointer hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); removeTarget(code); }}
                        />
                      )}
                    </Badge>
                  ))}
                </div>
                <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
              <div className="max-h-64 overflow-y-auto">
                {SONIOX_LANGUAGES.map((lang) => {
                  const selected = targetLangs.includes(lang.code);
                  return (
                    <button
                      type="button"
                      key={lang.code}
                      className={cn("flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent cursor-pointer", selected && "bg-accent")}
                      onClick={() => toggleTarget(lang.code)}
                    >
                      <Check className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                      {lang.name}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
