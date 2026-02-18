"use client";

import { ArrowLeftRight, ArrowRight } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TranslationMode } from "@/types/bilingual";
import { useT } from "@/lib/i18n";

interface TranslationModeToggleProps {
  mode: TranslationMode;
  onChange: (mode: TranslationMode) => void;
  disabled?: boolean;
}

export default function TranslationModeToggle({
  mode,
  onChange,
  disabled,
}: TranslationModeToggleProps) {
  const t = useT();

  return (
    <div className="px-4 py-3 border-b border-border">
      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {t("translation_mode")}
      </p>
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => {
          if (v) onChange(v as TranslationMode);
        }}
        disabled={disabled}
        variant="outline"
        className="w-full"
      >
        <ToggleGroupItem value="two_way" className="flex-1 gap-1.5 text-xs">
          <ArrowLeftRight className="size-3.5" />
          {t("mode_between")}
        </ToggleGroupItem>
        <ToggleGroupItem value="one_way" className="flex-1 gap-1.5 text-xs">
          <ArrowRight className="size-3.5" />
          {t("mode_from_to")}
        </ToggleGroupItem>
      </ToggleGroup>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {mode === "two_way"
          ? t("mode_between_desc")
          : t("mode_from_to_desc")}
      </p>
    </div>
  );
}
