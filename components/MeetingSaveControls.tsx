"use client";

import { AlertCircle, Check, Circle, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n";
import type { SaveStatus } from "@/hooks/useMeetingAutosave";

interface MeetingSaveControlsProps {
  status: SaveStatus;
  meetingId: string | null;
  // Audio archive: offered when file storage is configured
  canArchive: boolean;
  archiveOn: boolean;
  onArchiveChange: (on: boolean) => void;
  archiving: boolean; // the recorder is running
  uploading: boolean;
  uploadFailed: boolean;
  unsupported: boolean;
}

// Status bar: whether the meeting is saved (links to it, in a new tab so
// the recording page keeps its state), and the per-meeting audio switch —
// off by default, asks for consent when turned on, red while recording
export default function MeetingSaveControls({
  status,
  meetingId,
  canArchive,
  archiveOn,
  onArchiveChange,
  archiving,
  uploading,
  uploadFailed,
  unsupported,
}: MeetingSaveControlsProps) {
  const t = useT();

  const saveLabel =
    status === "saving" ? t("save_saving") : status === "error" ? t("save_error") : t("save_saved");
  const saveIcon =
    status === "saving" ? (
      <Loader2 className="size-3.5 animate-spin" aria-hidden />
    ) : status === "error" ? (
      <AlertCircle className="size-3.5 text-amber-700" aria-hidden />
    ) : (
      <Check className="size-3.5 text-green-700" aria-hidden />
    );

  const toggle = () => {
    if (archiveOn) onArchiveChange(false);
    else if (window.confirm(t("archive_confirm"))) onArchiveChange(true);
  };

  const archiveTitle = unsupported
    ? t("archive_unsupported")
    : uploadFailed
    ? t("archive_failed")
    : uploading
    ? t("archive_uploading")
    : archiveOn
    ? t("archive_on_title")
    : t("archive_off_title");

  return (
    <>
      {status !== "off" && meetingId && (
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={`/meetings/${meetingId}`}
              target="_blank"
              rel="noopener"
              data-save-status={status}
              aria-label={`${saveLabel} — ${t("save_open")}`}
              className="inline-flex h-8 items-center gap-1 rounded-md px-1.5 text-xs text-gray-600 hover:bg-muted"
            >
              {saveIcon}
              <span className="hidden md:inline">{saveLabel}</span>
            </a>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("save_open")}</TooltipContent>
        </Tooltip>
      )}
      {canArchive && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggle}
              aria-pressed={archiveOn}
              data-archive-toggle
              data-archiving={archiving || undefined}
              aria-label={`${t("archive_audio")} — ${archiveTitle}`}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-sm transition-colors hover:bg-muted ${
                archiveOn ? "border-red-600 text-red-700" : "border-border text-foreground"
              }`}
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : uploadFailed || unsupported ? (
                <AlertCircle className="size-3.5 text-amber-700" aria-hidden />
              ) : archiving ? (
                <span className="size-2.5 shrink-0 rounded-full bg-red-600 recording-pulse" aria-hidden />
              ) : (
                <Circle className={`size-3.5 ${archiveOn ? "fill-red-600 text-red-600" : ""}`} aria-hidden />
              )}
              <span className="hidden sm:inline">{t("archive_audio")}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{archiveTitle}</TooltipContent>
        </Tooltip>
      )}
    </>
  );
}
