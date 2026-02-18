"use client";

import { ArrowDown } from "lucide-react";
import { SONIOX_LANGUAGES } from "@/types/bilingual";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FromToLanguagesProps {
  languageA: string;
  languageB: string;
  onLanguageAChange: (code: string) => void;
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
  return (
    <div className="px-4 py-3 border-b border-border">
      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Languages
      </p>

      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Source Language
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
              <SelectItem value="*">Any Language (Auto)</SelectItem>
              <SelectSeparator />
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
          <ArrowDown className="size-4 text-muted-foreground" />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Target Language
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
