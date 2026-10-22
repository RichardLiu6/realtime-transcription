"use client";

import { ArrowUpDown } from "lucide-react";
import LanguageSelect from "@/components/LanguageSelect";
import { useT } from "@/lib/i18n";

interface BetweenLanguagesProps {
  languageA: string[];
  languageB: string;
  onLanguageAChange: (codes: string[]) => void;
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
  const t = useT();
  // two_way mode uses single language — take first element, fallback to "zh"
  const langA = languageA[0] === "*" ? "zh" : (languageA[0] ?? "zh");

  return (
    <div className="px-4 py-3 border-b border-border">
      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {t("languages")}
      </p>

      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("language_a")}
          </label>
          <LanguageSelect
            value={langA}
            onChange={(code) => onLanguageAChange([code])}
            disabled={disabled}
            disabledCodes={[languageB]}
            className="w-full"
          />
        </div>

        <div className="flex justify-center">
          <ArrowUpDown className="size-4 text-muted-foreground" />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("language_b")}
          </label>
          <LanguageSelect
            value={languageB}
            onChange={onLanguageBChange}
            disabled={disabled}
            disabledCodes={[langA]}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
