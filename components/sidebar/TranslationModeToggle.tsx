"use client";

import { ArrowLeftRight, ArrowRight, Monitor } from "lucide-react";
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
      {/* Icon above the label: longer labels (Español, Tiếng Việt) wrap
          instead of overflowing */}
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
        <ToggleGroupItem value="two_way" className="h-auto min-w-0 flex-1 flex-col gap-0.5 whitespace-normal px-1 py-1.5 text-center text-xs leading-tight">
          <ArrowLeftRight className="size-3.5" />
          {t("mode_between")}
        </ToggleGroupItem>
        <ToggleGroupItem value="one_way" className="h-auto min-w-0 flex-1 flex-col gap-0.5 whitespace-normal px-1 py-1.5 text-center text-xs leading-tight">
          <ArrowRight className="size-3.5" />
          {t("mode_from_to")}
        </ToggleGroupItem>
        <ToggleGroupItem value="presentation" className="h-auto min-w-0 flex-1 flex-col gap-0.5 whitespace-normal px-1 py-1.5 text-center text-xs leading-tight">
          <Monitor className="size-3.5" />
          {t("mode_presentation")}
        </ToggleGroupItem>
      </ToggleGroup>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {mode === "two_way"
          ? t("mode_between_desc")
          : mode === "one_way"
            ? t("mode_from_to_desc")
            : t("mode_presentation_desc")}
      </p>
    </div>
  );
}
