"use client";

import { ArrowUpDown } from "lucide-react";
import { SONIOX_LANGUAGES } from "@/types/bilingual";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BetweenLanguagesProps {
  languageA: string;
  languageB: string;
  onLanguageAChange: (code: string) => void;
  onLanguageBChange: (code: string) => void;
  disabled?: boolean;
}

export default function BetweenLanguages({
  languageA,
  languageB,
  onLanguageAChange,
  onLanguageBChange,
  disabled,
}: BetweenLanguagesProps) {
  return (
    <div className="px-4 py-3 border-b border-border">
      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Languages
      </p>

      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Language A
          </label>
          <Select
            value={languageA}
            onValueChange={onLanguageAChange}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SONIOX_LANGUAGES.map((lang) => (
                <SelectItem
                  key={lang.code}
                  value={lang.code}
                  disabled={lang.code === languageB}
                >
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-center">
          <ArrowUpDown className="size-4 text-muted-foreground" />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Language B
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
                <SelectItem
                  key={lang.code}
                  value={lang.code}
                  disabled={lang.code === languageA}
                >
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
