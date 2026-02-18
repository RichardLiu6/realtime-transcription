"use client";

import { ArrowDown, Check, ChevronsUpDown, X } from "lucide-react";
import { SONIOX_LANGUAGES } from "@/types/bilingual";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useT } from "@/lib/i18n";

interface FromToLanguagesProps {
  languageA: string[];
  languageB: string;
  onLanguageAChange: (codes: string[]) => void;
  onLanguageBChange: (code: string) => void;
  disabled?: boolean;
}

export default function FromToLanguages({
  languageA,
  languageB,
  onLanguageAChange,
  onLanguageBChange,
  disabled,
}: FromToLanguagesProps) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const isAny = languageA.length === 1 && languageA[0] === "*";

  const toggleLanguage = (code: string) => {
    if (code === "*") {
      // Selecting "Any" clears all specific selections
      onLanguageAChange(["*"]);
      return;
    }

    // Remove "*" if present, then toggle the specific language
    const withoutAny = languageA.filter((c) => c !== "*");

    if (withoutAny.includes(code)) {
      // Removing a language
      const next = withoutAny.filter((c) => c !== code);
      // If nothing left, fall back to "Any"
      onLanguageAChange(next.length === 0 ? ["*"] : next);
    } else {
      // Adding a language
      onLanguageAChange([...withoutAny, code]);
    }
  };

  const removeLanguage = (code: string) => {
    const next = languageA.filter((c) => c !== code && c !== "*");
    onLanguageAChange(next.length === 0 ? ["*"] : next);
  };

  const getLanguageName = (code: string) => {
    if (code === "*") return t("any_language");
    return SONIOX_LANGUAGES.find((l) => l.code === code)?.name ?? code;
  };

  return (
    <div className="px-4 py-3 border-b border-border">
      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {t("languages")}
      </p>

      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("source_language")}
          </label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between font-normal h-auto min-h-9"
                disabled={disabled}
              >
                <div className="flex flex-wrap gap-1 flex-1 text-left">
                  {isAny ? (
                    <span className="text-sm">{t("any_language")}</span>
                  ) : (
                    languageA.map((code) => (
                      <Badge
                        key={code}
                        variant="secondary"
                        className="text-xs px-1.5 py-0 h-5"
                      >
                        {getLanguageName(code)}
                        {!disabled && (
                          <X
                            className="size-3 ml-0.5 cursor-pointer hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeLanguage(code);
                            }}
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
                {/* Any option */}
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent cursor-pointer",
                    isAny && "bg-accent"
                  )}
                  onClick={() => toggleLanguage("*")}
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      isAny ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {t("any_language")}
                </button>

                <div className="h-px bg-border" />

                {/* Language list */}
                {SONIOX_LANGUAGES.map((lang) => {
                  const selected =
                    !isAny && languageA.includes(lang.code);
                  return (
                    <button
                      type="button"
                      key={lang.code}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent cursor-pointer",
                        selected && "bg-accent"
                      )}
                      onClick={() => toggleLanguage(lang.code)}
                    >
                      <Check
                        className={cn(
                          "size-4 shrink-0",
                          selected ? "opacity-100" : "opacity-0"
                        )}
                      />
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

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("target_language")}
          </label>
          <Select
            value={languageB}
            onValueChange={onLanguageBChange}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SONIOX_LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
