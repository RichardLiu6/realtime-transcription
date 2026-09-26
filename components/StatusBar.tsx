"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, User, Shield, PanelLeft, LayoutDashboard, Move, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n";
import type { DesktopLayout } from "@/app/page";
import type { SttProvider, TranslationEngine } from "@/types/bilingual";

interface StatusBarProps {
  recordingState: "idle" | "connecting" | "recording";
  elapsedSeconds: number;
  error: string | null;
  desktopLayout?: DesktopLayout;
  onDesktopLayoutChange?: (layout: DesktopLayout) => void;
  sttProvider?: SttProvider;
  onSttProviderChange?: (provider: SttProvider) => void;
  r2t2Enabled?: boolean;
  audioProcessing?: boolean;
  onAudioProcessingChange?: (on: boolean) => void;
  translationEngine?: TranslationEngine;
  onTranslationEngineChange?: (engine: TranslationEngine) => void;
  t3poEnabled?: boolean;
}

const LAYOUT_OPTIONS: { value: DesktopLayout; icon: typeof PanelLeft; label: string }[] = [
  { value: "sidebar", icon: PanelLeft, label: "Sidebar" },
  { value: "topbar", icon: LayoutDashboard, label: "Top Bar" },
  { value: "floating", icon: Move, label: "Floating" },
];

export default function StatusBar({
  recordingState,
  elapsedSeconds,
  error,
  desktopLayout,
  onDesktopLayoutChange,
  sttProvider,
  onSttProviderChange,
  r2t2Enabled = false,
  audioProcessing,
  onAudioProcessingChange,
  translationEngine,
  onTranslationEngineChange,
  t3poEnabled = false,
}: StatusBarProps) {
  const t = useT();
  const router = useRouter();
  const isRecording = recordingState === "recording";
  const isConnecting = recordingState === "connecting";
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");

  const [userName, setUserName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          setUserName(d.user.name);
          if (d.user.role === "admin") setIsAdmin(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }, [router]);

  return (
    <div className="shrink-0">
      {/* Error banner */}
      {error && (
        <div className="bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between border-b border-border bg-background px-4 py-2">
        {/* Left: recording status + layout picker */}
        <div className="flex items-center gap-3">
          {isRecording && (
            <div className="hidden lg:flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500 recording-pulse" />
              <span className="font-mono text-sm font-semibold text-foreground">
                {minutes}:{seconds}
              </span>
            </div>
          )}

          {isConnecting && (
            <div className="hidden lg:flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {t("connecting")}
              </span>
            </div>
          )}

          {/* STT engine picker (locked while recording) */}
          {sttProvider && onSttProviderChange && (
            <div
              className="flex items-center gap-0.5 rounded-md border border-border p-0.5"
              role="radiogroup"
              aria-label={t("stt_engine")}
            >
              {(["soniox", "r2t2"] as const).map((value) => {
                const unavailable = value === "r2t2" && !r2t2Enabled;
                const locked = recordingState !== "idle";
                return (
                  <Tooltip key={value}>
                    <TooltipTrigger asChild>
                      {/* span wrapper: disabled buttons don't fire tooltip events */}
                      <span className="inline-flex">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={sttProvider === value}
                        disabled={locked || unavailable}
                        onClick={() => onSttProviderChange(value)}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                          sttProvider === value
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
                        }`}
                      >
                        {value === "soniox" ? "Soniox" : "R2T2"}
                      </button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {value === "soniox"
                        ? t("stt_soniox_desc")
                        : unavailable
                          ? t("stt_r2t2_unavailable")
                          : t("stt_r2t2_desc")}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}

          {/* Translation engine picker (locked while recording) */}
          {translationEngine && onTranslationEngineChange && (
            <div
              className="flex items-center gap-0.5 rounded-md border border-border p-0.5"
              role="radiogroup"
              aria-label={t("translation_engine")}
            >
              {(["llm", "clause", "t3po"] as const).map((value) => {
                const unavailable = value === "t3po" && !t3poEnabled;
                return (
                  <Tooltip key={value}>
                    <TooltipTrigger asChild>
                      {/* span wrapper: disabled buttons don't fire tooltip events */}
                      <span className="inline-flex">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={translationEngine === value}
                          disabled={recordingState !== "idle" || unavailable}
                          onClick={() => onTranslationEngineChange(value)}
                          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                            translationEngine === value
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
                          }`}
                        >
                          {t(value === "llm" ? "tr_llm" : value === "clause" ? "tr_clause" : "tr_t3po")}
                        </button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-64">
                      {value === "llm"
                        ? t("tr_llm_desc")
                        : value === "clause"
                          ? t("tr_clause_desc")
                          : unavailable
                          ? t("tr_t3po_unavailable")
                          : t("tr_t3po_desc")}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}

          {/* Browser noise suppression toggle (locked while recording) */}
          {audioProcessing !== undefined && onAudioProcessingChange && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={audioProcessing}
                    disabled={recordingState !== "idle"}
                    onClick={() => onAudioProcessingChange(!audioProcessing)}
                    className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      audioProcessing
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <AudioLines className="size-3" />
                    {t("audio_processing")}
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64">
                {audioProcessing ? t("audio_processing_on") : t("audio_processing_off")}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Desktop layout picker */}
          {desktopLayout && onDesktopLayoutChange && (
            <div className="hidden lg:flex items-center gap-0.5">
              {LAYOUT_OPTIONS.map(({ value, icon: Icon, label }) => (
                <Tooltip key={value}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onDesktopLayoutChange(value)}
                      className={`p-1.5 rounded transition-colors ${
                        desktopLayout === value
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{label}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
        </div>

        {/* Right: user info + logout */}
        {userName && (
          <div className="flex items-center gap-2">
            <User className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{userName}</span>
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => router.push("/admin")}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Admin panel"
              >
                <Shield className="size-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Logout"
            >
              <LogOut className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
