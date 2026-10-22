"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Radio } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/lib/i18n";

interface LiveShareButtonProps {
  sharing: boolean;
  starting: boolean;
  failing: boolean;
  viewerUrl: string | null;
  onStart: () => void;
  onStop: () => void;
}

// Status-bar button for sharing the multilingual captions: starts a share
// and shows its link (copy / stop) while it runs
export default function LiveShareButton({ sharing, starting, failing, viewerUrl, onStart, onStop }: LiveShareButtonProps) {
  const t = useT();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("share_title")}
          aria-label={sharing ? t("sharing_captions") : t("share_captions")}
          data-live-share-button
          data-sharing={sharing || undefined}
          className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-sm transition-colors hover:bg-muted ${
            sharing ? "border-green-600 text-green-800" : "border-border text-foreground"
          }`}
        >
          {sharing ? (
            <span className="size-2 shrink-0 rounded-full bg-green-600 recording-pulse" aria-hidden />
          ) : (
            <Radio className="size-4 shrink-0" aria-hidden />
          )}
          <span className="hidden sm:inline">{sharing ? t("sharing_captions") : t("share_captions")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1.5rem)] space-y-3 p-3" data-live-share>
        <LiveSharePanel sharing={sharing} starting={starting} failing={failing} viewerUrl={viewerUrl} onStart={onStart} onStop={onStop} />
      </PopoverContent>
    </Popover>
  );
}

// What the button's popover shows (also the phone layout's 更多 sheet):
// start sharing, or the link with copy / stop
export function LiveSharePanel({ sharing, starting, failing, viewerUrl, onStart, onStop }: LiveShareButtonProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!viewerUrl) return;
    try {
      await navigator.clipboard.writeText(viewerUrl);
    } catch {
      // Clipboard blocked: the link stays selectable in the field
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
        <p className="text-sm font-semibold">{t("share_captions")}</p>
        <p className="text-xs text-gray-600">{t("share_hint")}</p>
        {sharing && viewerUrl ? (
          <>
            <div className="flex items-center gap-1.5">
              <input
                readOnly
                value={viewerUrl}
                aria-label={t("share_captions")}
                data-live-link
                onFocus={(e) => e.currentTarget.select()}
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-muted/40 px-2 text-xs text-foreground"
              />
              <button
                type="button"
                onClick={copy}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? t("link_copied") : t("copy_link")}
              </button>
            </div>
            {failing && (
              <p role="alert" className="text-xs text-amber-800">
                {t("share_failing")}
              </p>
            )}
            <button
              type="button"
              onClick={onStop}
              className="w-full rounded-md border border-red-300 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              {t("stop_sharing")}
            </button>
          </>
        ) : (
          <>
            {failing && (
              <p role="alert" className="text-xs text-red-700">
                {t("share_error")}
              </p>
            )}
            <button
              type="button"
              onClick={onStart}
              disabled={starting}
              data-live-share-start
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-foreground px-2 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
            >
              {starting && <Loader2 className="size-3.5 animate-spin" />}
              {t("share_captions")}
            </button>
          </>
        )}
      </div>
  );
}
