"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  LogOut,
  User,
  Shield,
  PanelLeft,
  LayoutDashboard,
  Move,
  AudioLines,
  Settings2,
  ChevronDown,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useT, type TranslationKey } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
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

const LAYOUT_OPTIONS: { value: DesktopLayout; icon: typeof PanelLeft; label: TranslationKey }[] = [
  { value: "sidebar", icon: PanelLeft, label: "layout_sidebar" },
  { value: "topbar", icon: LayoutDashboard, label: "layout_topbar" },
  { value: "floating", icon: Move, label: "layout_floating" },
];

const ENGINE_LABEL: Record<TranslationEngine, TranslationKey> = {
  llm: "tr_llm",
  clause: "tr_clause",
  t3po: "tr_t3po",
};
const ENGINE_DESC: Record<TranslationEngine, TranslationKey> = {
  llm: "tr_llm_desc",
  clause: "tr_clause_desc",
  t3po: "tr_t3po_desc",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 border-t border-border px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

interface OptionProps {
  label: ReactNode;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
  // Shown on hover — only for options an admin sees although unavailable
  tooltip?: string;
}

// One segment of a radio group in the advanced settings
function Option({ label, checked, disabled, onSelect, tooltip }: OptionProps) {
  const button = (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={`inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
        checked
          ? "bg-primary text-primary-foreground disabled:opacity-70"
          : "text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
      }`}
    >
      {label}
    </button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Disabled buttons don't fire pointer events: the span wrapper
            gets them (the button lets them through) */}
        <span className="inline-flex flex-1 [&>button:disabled]:pointer-events-none">{button}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function RadioRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-border p-0.5"
      role="radiogroup"
      aria-label={label}
    >
      {children}
    </div>
  );
}

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
  // Engine, translation style and noise reduction apply when a recording
  // starts, so they are locked while one runs
  const locked = recordingState !== "idle";
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

  // Options the server isn't configured for are hidden from normal users;
  // an admin sees them disabled, with the env vars that would enable them
  const sttOptions = (["soniox", "r2t2"] as const).filter(
    (v) => v !== "r2t2" || r2t2Enabled || isAdmin
  );
  const engineOptions = (["llm", "clause", "t3po"] as const).filter(
    (v) => v !== "t3po" || t3poEnabled || isAdmin
  );

  return (
    <div className="shrink-0">
      {/* Error banner */}
      {error && (
        <div className="bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Status bar: recording state + the one timer on the left; interface
          language, advanced settings and the user menu on the right */}
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border bg-background px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          {isRecording && (
            <>
              <span className="h-2 w-2 shrink-0 rounded-full bg-red-500 recording-pulse" />
              <span className="sr-only">{t("recording_status")}</span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {minutes}:{seconds}
              </span>
            </>
          )}
          {isConnecting && (
            <>
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
              <span className="truncate text-sm text-muted-foreground">{t("connecting")}</span>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {/* Advanced settings: speech engine, translation style, noise
              reduction, desktop layout */}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("advanced_settings")}
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
                  >
                    <Settings2 className="size-4" />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("advanced_settings")}</TooltipContent>
            </Tooltip>
            <PopoverContent
              side="bottom"
              align="end"
              data-advanced-settings
              className="w-80 max-w-[calc(100vw-1.5rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-0"
            >
              <p className="px-3 pt-3 text-sm font-semibold">{t("advanced_settings")}</p>
              {locked && (
                <p className="px-3 pt-1 text-xs text-muted-foreground">{t("settings_locked")}</p>
              )}
              <div className="pt-1">
                {sttProvider && onSttProviderChange && (
                  <Section title={t("stt_engine")}>
                    <RadioRow label={t("stt_engine")}>
                      {sttOptions.map((value) => {
                        const unavailable = value === "r2t2" && !r2t2Enabled;
                        return (
                          <Option
                            key={value}
                            label={value === "soniox" ? "Soniox" : "R2T2"}
                            checked={sttProvider === value}
                            disabled={locked || unavailable}
                            onSelect={() => onSttProviderChange(value)}
                            tooltip={unavailable ? t("stt_r2t2_unavailable") : undefined}
                          />
                        );
                      })}
                    </RadioRow>
                    <p className="text-xs leading-snug text-muted-foreground">
                      {sttProvider === "r2t2" ? t("stt_r2t2_desc") : t("stt_soniox_desc")}
                    </p>
                  </Section>
                )}

                {translationEngine && onTranslationEngineChange && (
                  <Section title={t("translation_engine")}>
                    <RadioRow label={t("translation_engine")}>
                      {engineOptions.map((value) => {
                        const unavailable = value === "t3po" && !t3poEnabled;
                        return (
                          <Option
                            key={value}
                            label={t(ENGINE_LABEL[value])}
                            checked={translationEngine === value}
                            disabled={locked || unavailable}
                            onSelect={() => onTranslationEngineChange(value)}
                            tooltip={unavailable ? t("tr_t3po_unavailable") : undefined}
                          />
                        );
                      })}
                    </RadioRow>
                    <p className="text-xs leading-snug text-muted-foreground">
                      {t(ENGINE_DESC[translationEngine])}
                    </p>
                  </Section>
                )}

                {audioProcessing !== undefined && onAudioProcessingChange && (
                  <Section title={t("audio_processing")}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={audioProcessing}
                      disabled={locked}
                      onClick={() => onAudioProcessingChange(!audioProcessing)}
                      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        audioProcessing
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <AudioLines className="size-3.5" />
                      {t("audio_processing")}
                    </button>
                    <p className="text-xs leading-snug text-muted-foreground">
                      {audioProcessing ? t("audio_processing_on") : t("audio_processing_off")}
                    </p>
                  </Section>
                )}

                {/* Layouts exist on desktop only */}
                {desktopLayout && onDesktopLayoutChange && (
                  <div className="hidden lg:block">
                    <Section title={t("desktop_layout")}>
                      <RadioRow label={t("desktop_layout")}>
                        {LAYOUT_OPTIONS.map(({ value, icon: Icon, label }) => (
                          <Option
                            key={value}
                            label={
                              <>
                                <Icon className="size-3.5" aria-hidden />
                                {t(label)}
                              </>
                            }
                            checked={desktopLayout === value}
                            disabled={false}
                            onSelect={() => onDesktopLayoutChange(value)}
                          />
                        ))}
                      </RadioRow>
                    </Section>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <LanguageSwitcher />

          {/* User menu: name, admin panel, log out */}
          {userName && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={t("user_menu")}
                  className="inline-flex h-8 max-w-40 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted"
                >
                  <User className="size-3.5 shrink-0" aria-hidden />
                  <span className="hidden truncate sm:inline">{userName}</span>
                  <ChevronDown className="size-3 shrink-0" aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="end" className="w-52 p-1">
                <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">{userName}</p>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => router.push("/admin")}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <Shield className="size-3.5" aria-hidden />
                    {t("admin_panel")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="size-3.5" aria-hidden />
                  {t("logout")}
                </button>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </div>
  );
}
