"use client";

import { useState } from "react";
import { UserRoundPen, UserRoundPlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/lib/i18n";
import { newSpeakerId } from "@/hooks/useSpeakerManager";

export interface SpeakerOption {
  id: string;
  name: string;
  color: string;
}

// Moves just this sentence to another speaker — or to a new one, when the
// engine put two people under one — unlike renaming, which covers everything
// that speaker said. Faint until its row is hovered (a `group` ancestor) or
// the button focused; always shown on touch screens. Used by the transcript
// and the multilingual table / cards.
export default function ReassignSentence({
  entryId,
  speaker,
  speakerOptions,
  onReassign,
  className = "",
}: {
  entryId: string;
  speaker: string;
  speakerOptions: SpeakerOption[];
  onReassign: (entryId: string, speakerId: string) => void;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const others = speakerOptions.filter((s) => s.id !== speaker);
  const pick = (id: string) => {
    onReassign(entryId, id);
    setOpen(false);
  };
  const item =
    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("reassign_sentence")}
          title={t("reassign_sentence")}
          data-reassign
          className={`inline-flex size-6 shrink-0 items-center justify-center rounded align-middle text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100 ${className}`}
        >
          <UserRoundPen className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-auto min-w-44 max-w-72 p-1">
        <p className="px-2 py-1 text-xs text-muted-foreground">{t("reassign_to")}</p>
        {others.map((s) => (
          <button key={s.id} type="button" data-reassign-to={s.id} onClick={() => pick(s.id)} className={item}>
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="truncate" style={{ color: s.color }}>
              {s.name}
            </span>
          </button>
        ))}
        {others.length > 0 && <div className="my-1 border-t border-border" />}
        <button
          type="button"
          data-reassign-new
          onClick={() => pick(newSpeakerId(speaker, speakerOptions.map((s) => s.id)))}
          className={item}
        >
          <UserRoundPlus className="size-3.5 shrink-0 text-muted-foreground" />
          {t("reassign_new")}
        </button>
      </PopoverContent>
    </Popover>
  );
}
