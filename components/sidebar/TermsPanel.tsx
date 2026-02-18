"use client";

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
  const termsCount = termsText
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean).length;

  const appendPresetTerms = (key: string) => {
    const preset = INDUSTRY_PRESETS[key];
    if (!preset) return;
    const current = termsText.trim();
    const joined = preset.terms.join(", ");
    onTermsTextChange(current ? `${current}, ${joined}` : joined);
  };

  return (
    <div className="px-4 border-b border-border">
      <Accordion type="single" collapsible>
        <AccordionItem value="terms" className="border-b-0">
          <AccordionTrigger className="py-3 hover:no-underline">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Context Terms
              {termsCount > 0 && (
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary normal-case">
                  {termsCount}
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent>
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

            <textarea
              value={termsText}
              onChange={(e) => onTermsTextChange(e.target.value)}
              rows={3}
              placeholder="Enter terms, separated by commas"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
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
