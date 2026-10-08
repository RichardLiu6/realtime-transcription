"use client";

// Phone layout (< lg): one screen, one main button. A top bar (☰ for the
// sidebar, the meeting's languages, save status), the transcript, and a
// bottom bar that changes with the state: a big start button when there is
// nothing yet, stop while recording, continue / export / new meeting after.
// Everything else is one step away: 更多 (this meeting), the sidebar (new
// meeting, saved meetings, settings & account) and 会议设置 (languages).
// Desktop renders only `children` (the transcript panel).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  Download,
  FilePlus,
  Loader2,
  Menu,
  Mic,
  MoreHorizontal,
  PictureInPicture2,
  Square,
} from "lucide-react";
import SpeakerPanel from "@/components/sidebar/SpeakerPanel";
import { LiveSharePanel } from "@/components/LiveShareButton";
import { INDUSTRY_PRESETS, presetLabel } from "@/lib/contextTerms";
import { LOCALES, setLocale, useLocale, useT, type Locale, type TranslationKey } from "@/lib/i18n";
import type { BilingualEntry, CaptureSource, SpeakerInfo, SttProvider, TranslationEngine, TranslationMode } from "@/types/bilingual";
import { meetingLanguagesOf, type MeetingSettingsSetters } from "@/lib/phoneModes";
import { usePip } from "@/lib/native/pip";
import type { SaveStatus } from "@/hooks/useMeetingAutosave";
import MeetingSettings, { useMeetingSummary } from "./MeetingSettings";
import PhoneTerms from "./PhoneTerms";
import Drawer from "./Drawer";
import MeetingDetailView from "@/components/meetings/MeetingDetailView";
import { BottomSheet, Row, SectionTitle, SideSheet, homeLanguage } from "./parts";


export interface PhoneChromeProps {
  children: ReactNode;
  // Presentation mode covers the screen: no edge swipe for the sidebar
  gesturesDisabled?: boolean;
  error: string | null;
  // Meeting
  translationMode: TranslationMode;
  languageA: string[];
  languageB: string;
  targetLangs: string[];
  setters: MeetingSettingsSetters;
  // Terms
  termsText: string;
  onTermsTextChange: (text: string) => void;
  selectedPresets: Set<string>;
  onSelectedPresetsChange: (presets: Set<string>) => void;
  customTerms: string[];
  onCustomTermsChange: (terms: string[]) => void;
  // Speakers
  speakers: Map<string, SpeakerInfo>;
  onRenameSpeaker: (speakerId: string, newLabel: string) => void;
  entries: BilingualEntry[];
  // Recording
  recordingState: "idle" | "connecting" | "recording";
  elapsedSeconds: number;
  onStart: () => void;
  onStop: () => void;
  onExport: () => void;
  onNewMeeting: () => void;
  onPresent: () => void;
  // Live caption sharing (group meetings and transcribe only)
  share: {
    sharing: boolean;
    starting: boolean;
    failing: boolean;
    viewerUrl: string | null;
    onStart: () => void;
    onStop: () => void;
  } | null;
  // Saved meetings
  save: {
    available: boolean;
    status: SaveStatus;
    meetingId: string | null;
    canArchive: boolean;
    archiveOn: boolean;
    onArchiveChange: (on: boolean) => void;
  };
  // Settings (applied when a recording starts)
  settings: {
    sttProvider: SttProvider;
    onSttProviderChange: (p: SttProvider) => void;
    r2t2Enabled: boolean;
    translationEngine: TranslationEngine;
    onTranslationEngineChange: (e: TranslationEngine) => void;
    t3poEnabled: boolean;
    audioProcessing: boolean;
    onAudioProcessingChange: (on: boolean) => void;
    captureSource?: CaptureSource; // iOS app only
    onCaptureSourceChange?: (s: CaptureSource) => void;
  };
}

type Sheet = null | "settings" | "more" | "terms" | "speakers" | "drawer" | "prefs";

export default function PhoneChrome(props: PhoneChromeProps) {
  const t = useT();
  const { recordingState, entries } = props;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [viewing, setViewing] = useState<string | null>(null); // meeting id open in the viewer
  const user = useUser();
  const pip = usePip();
  const isRecording = recordingState === "recording";
  const isConnecting = recordingState === "connecting";
  const busy = recordingState !== "idle";
  const hasEntries = entries.length > 0;
  // Nothing yet: the big start button takes the middle of the screen
  const empty = !hasEntries && !isRecording;

  const locale = useLocale();
  // The languages this meeting is in (AI-suggested terms default to them)
  const meetingLangs = useMemo(
    () => meetingLanguagesOf(props.translationMode, props.languageA, props.languageB, props.targetLangs, homeLanguage(locale)),
    [props.translationMode, props.languageA, props.languageB, props.targetLangs, locale]
  );

  const summary = useMeetingSummary(props.translationMode, props.languageA, props.languageB, props.targetLangs);
  const close = useCallback(() => setSheet(null), []);
  const open = (s: Sheet) => () => setSheet(s);

  const termsLabel = useMemo(() => {
    const names = Array.from(props.selectedPresets)
      .map((k) => INDUSTRY_PRESETS[k] && presetLabel(k, INDUSTRY_PRESETS[k].label, t))
      .filter(Boolean);
    if (props.customTerms.length > 0) names.push(`+${props.customTerms.length}`);
    return names.length ? names.join(" · ") : t("ph_terms_none");
  }, [props.selectedPresets, props.customTerms, t]);

  return (
    <>
      {/* Top bar */}
      <div className="shrink-0 lg:hidden">
        {props.error && (
          <div role="alert" className="bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
            {props.error}
          </div>
        )}
        <div className="flex items-center gap-2 px-2 py-1.5">
          <button
            type="button"
            aria-label={t("ph_menu")}
            onClick={open("drawer")}
            data-phone-menu
            className="grid size-10 shrink-0 place-items-center rounded-full text-foreground hover:bg-muted"
          >
            <Menu className="size-5" />
          </button>
          <button
            type="button"
            onClick={open("settings")}
            data-phone-languages
            className="mx-auto inline-flex min-w-0 max-w-[70%] items-center gap-1 rounded-full border border-border px-3.5 py-1.5 text-[15px] font-semibold text-foreground hover:bg-muted"
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="size-4 shrink-0 text-gray-600" aria-hidden />
          </button>
          <SaveDot save={props.save} />
        </div>
      </div>

      {/* Transcript (desktop: always; phone: once there is something) */}
      <div className={`flex min-h-0 flex-1 flex-col ${empty ? "max-lg:hidden" : ""}`}>{props.children}</div>

      {/* Phone, nothing yet: one big button */}
      {empty && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 lg:hidden" data-phone-idle>
          <button
            type="button"
            onClick={props.onStart}
            disabled={isConnecting}
            aria-label={t("start_recording")}
            data-phone-start
            className="grid size-28 place-items-center rounded-full bg-foreground text-background shadow-xl transition-transform active:scale-95 disabled:opacity-70"
          >
            {isConnecting ? <Loader2 className="size-10 animate-spin" /> : <Mic className="size-10" />}
          </button>
          <p className="text-lg font-semibold text-foreground">
            {isConnecting ? t("connecting") : t("ph_tap_start")}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Chip onClick={open("terms")} active={props.selectedPresets.size + props.customTerms.length > 0}>
              {t("terms")} · {termsLabel}
            </Chip>
            {props.settings.captureSource && (
              <Chip onClick={open("prefs")} active={props.settings.captureSource === "system"}>
                {t("capture_source")} · {t(props.settings.captureSource === "system" ? "capture_system" : "capture_mic")}
              </Chip>
            )}
          </div>
        </div>
      )}

      {/* Bottom bar */}
      {!empty && (
        <div className="shrink-0 border-t border-border bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:hidden">
          {busy ? (
            // Recording: stop in the middle, 更多 on the right
            <div className="grid grid-cols-3 items-center">
              {/* iOS app: floating captions over other apps */}
              {pip.available ? (
                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={pip.active ? pip.stop : pip.start}
                    aria-label={t("ph_pip_label")}
                    aria-pressed={pip.active}
                    data-phone-pip
                    className={`flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium ${
                      pip.active ? "bg-foreground text-background" : "bg-muted text-foreground"
                    }`}
                  >
                    <PictureInPicture2 className="size-4" aria-hidden />
                    {t("ph_pip")}
                  </button>
                </div>
              ) : (
                <span />
              )}
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={props.onStop}
                  disabled={isConnecting}
                  aria-label={t("stop_recording")}
                  data-phone-stop
                  className="grid size-16 place-items-center rounded-full bg-red-600 text-white shadow-lg transition-transform active:scale-95 disabled:opacity-70"
                >
                  {isConnecting ? <Loader2 className="size-6 animate-spin" /> : <Square className="size-6 fill-current" />}
                </button>
                <span className="flex items-center gap-1.5 font-mono text-sm tabular-nums text-foreground">
                  <span className="size-2 rounded-full bg-red-600 recording-pulse" aria-hidden />
                  {formatElapsed(props.elapsedSeconds)}
                </span>
              </div>
              <div className="flex justify-end">
                <IconButton label={t("ph_more")} onClick={open("more")}>
                  <MoreHorizontal className="size-5" />
                </IconButton>
              </div>
            </div>
          ) : (
            // Stopped: continue is the main action
            <div className="space-y-2">
              <button
                type="button"
                onClick={props.onStart}
                data-phone-continue
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-base font-semibold text-background active:opacity-90"
              >
                <Mic className="size-5" />
                {t("ph_continue")}
              </button>
              <div className="grid grid-cols-3 gap-2">
                <SoftButton onClick={props.onExport} icon={<Download className="size-4" />}>
                  {t("ph_export_share")}
                </SoftButton>
                <SoftButton onClick={props.onNewMeeting} icon={<FilePlus className="size-4" />}>
                  {t("new_meeting")}
                </SoftButton>
                <SoftButton onClick={open("more")} icon={<MoreHorizontal className="size-4" />}>
                  {t("ph_more")}
                </SoftButton>
              </div>
            </div>
          )}
        </div>
      )}

      <MeetingSettings
        open={sheet === "settings"}
        onOpenChange={(o) => setSheet(o ? "settings" : null)}
        locked={busy}
        translationMode={props.translationMode}
        languageA={props.languageA}
        languageB={props.languageB}
        targetLangs={props.targetLangs}
        setters={props.setters}
      />

      {/* 更多: things about this meeting */}
      <BottomSheet open={sheet === "more"} onOpenChange={(o) => setSheet(o ? "more" : null)} title={t("ph_this_meeting")}>
        <Row
          label={t("present")}
          description={t("ph_present_desc")}
          onClick={() => {
            close();
            props.onPresent();
          }}
        />
        <Row label={t("terms")} value={termsLabel} onClick={open("terms")} />
        <Row label={t("speakers")} value={t("ph_people", { n: props.speakers.size })} onClick={open("speakers")} disabled={props.speakers.size === 0} />
        {props.save.available && props.save.meetingId && (
          <Row label={t("ph_open_record")} onClick={() => { close(); setViewing(props.save.meetingId); }} />
        )}
        {props.save.canArchive && (
          <Row
            label={t("archive_audio")}
            chevron={false}
            onClick={() => {
              if (props.save.archiveOn) props.save.onArchiveChange(false);
              else if (window.confirm(t("archive_confirm"))) props.save.onArchiveChange(true);
            }}
            value={<Switch on={props.save.archiveOn} danger />}
          />
        )}
        <SectionTitle>{t("share_captions")}</SectionTitle>
        {props.share ? (
          <div className="pb-2 text-sm">
            <LiveSharePanel {...props.share} />
          </div>
        ) : (
          <p className="pb-2 text-sm text-gray-600">{t("ph_share_only")}</p>
        )}
      </BottomSheet>

      <BottomSheet open={sheet === "terms"} onOpenChange={(o) => setSheet(o ? "terms" : null)} title={t("terms")} tall>
        <PhoneTerms
          onTermsTextChange={props.onTermsTextChange}
          selectedPresets={props.selectedPresets}
          onSelectedPresetsChange={props.onSelectedPresetsChange}
          customTerms={props.customTerms}
          onCustomTermsChange={props.onCustomTermsChange}
          isRecording={isRecording}
          meetingLanguages={meetingLangs}
        />
      </BottomSheet>

      <BottomSheet open={sheet === "speakers"} onOpenChange={(o) => setSheet(o ? "speakers" : null)} title={t("speakers")}>
        <div className="-mx-5">
          <SpeakerPanel speakers={props.speakers} entries={entries} onRenameSpeaker={props.onRenameSpeaker} />
        </div>
      </BottomSheet>

      <Drawer
        open={sheet === "drawer"}
        onOpenChange={(o) => setSheet(o ? "drawer" : null)}
        gesturesEnabled={sheet === null && !viewing && !props.gesturesDisabled}
        recording={busy}
        canSave={props.save.available}
        current={props.save.meetingId && (hasEntries || busy) ? { id: props.save.meetingId, summary } : null}
        userName={user?.name ?? ""}
        onNewMeeting={() => {
          close();
          props.onNewMeeting();
        }}
        onOpenMeeting={(id) => {
          close();
          setViewing(id);
        }}
        onBackToRecording={close}
        onSettings={open("prefs")}
      />

      <Preferences open={sheet === "prefs"} onOpenChange={(o) => setSheet(o ? "prefs" : null)} locked={busy} settings={props.settings} />

      {/* A saved meeting, inside the app, over the recording page (which
          keeps recording underneath) */}
      {viewing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("my_meetings")}
          className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-background lg:hidden"
        >
          <MeetingDetailView id={viewing} inApp onBack={() => setViewing(null)} onDeleted={() => setViewing(null)} />
        </div>
      )}
    </>
  );
}

function formatElapsed(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function SaveDot({ save }: { save: PhoneChromeProps["save"] }) {
  const t = useT();
  if (!save.available || !save.meetingId || save.status === "off") return <span className="size-10 shrink-0" aria-hidden />;
  const [color, label] =
    save.status === "saving"
      ? ["bg-amber-500", t("ph_saving")]
      : save.status === "error"
        ? ["bg-red-600", t("ph_save_failed")]
        : ["bg-green-600", t("ph_saved")];
  return (
    <span className="flex w-10 shrink-0 items-center justify-end gap-1 text-[11px] text-gray-700" data-phone-save={save.status}>
      <span className={`size-1.5 rounded-full ${color}`} aria-hidden />
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}

function Chip({ children, onClick, active }: { children: ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`max-w-full truncate rounded-full px-3 py-1.5 text-sm ${
        active ? "bg-blue-50 text-blue-800" : "bg-muted text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex flex-col items-center gap-1 text-xs text-gray-700"
    >
      <span className="grid size-11 place-items-center rounded-full border border-border bg-muted/60">{children}</span>
      {label}
    </button>
  );
}

function SoftButton({ onClick, icon, children }: { onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-muted px-2 text-sm text-foreground active:opacity-80"
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

function Switch({ on, danger }: { on: boolean; danger?: boolean }) {
  return (
    <span
      role="switch"
      aria-checked={on}
      className={`relative inline-block h-6 w-10 shrink-0 rounded-full transition-colors ${on ? (danger ? "bg-red-600" : "bg-foreground") : "bg-gray-300"}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </span>
  );
}

function useUser() {
  const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => {});
  }, []);
  return user;
}

// --- Settings & account ---

const ENGINE_LABEL: Record<TranslationEngine, TranslationKey> = { llm: "tr_llm", clause: "tr_clause", t3po: "tr_t3po" };
const ENGINE_DESC: Record<TranslationEngine, TranslationKey> = {
  llm: "tr_llm_desc",
  clause: "tr_clause_desc",
  t3po: "tr_t3po_desc",
};

function Preferences({
  open,
  onOpenChange,
  locked,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locked: boolean;
  settings: PhoneChromeProps["settings"];
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const user = useUser();
  const isAdmin = user?.role === "admin";
  const sttOptions = (["soniox", "r2t2"] as const).filter((v) => v !== "r2t2" || settings.r2t2Enabled);
  const engineOptions = (["llm", "clause", "t3po"] as const).filter((v) => v !== "t3po" || settings.t3poEnabled);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <SideSheet open={open} onOpenChange={onOpenChange} side="right" title={t("settings")} className="w-full sm:max-w-full">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-1 px-2 py-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-0.5 rounded-md px-1 py-1 text-[15px] text-blue-700"
          >
            <ChevronLeft className="size-5" aria-hidden />
            {t("ph_back")}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <h2 className="text-2xl font-bold">{t("settings")}</h2>
          {locked && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("settings_locked")}</p>}

          <SectionTitle>{t("ph_section_recording")}</SectionTitle>
          {settings.captureSource && settings.onCaptureSourceChange && (
            <Choice
              label={t("capture_source")}
              description={t(settings.captureSource === "mic" ? "capture_mic_desc" : "capture_system_desc")}
              value={settings.captureSource}
              options={[
                { value: "mic", label: t("capture_mic") },
                { value: "system", label: t("capture_system") },
              ]}
              disabled={locked}
              onChange={settings.onCaptureSourceChange}
            />
          )}
          <Choice
            label={t("translation_engine")}
            description={t(ENGINE_DESC[settings.translationEngine])}
            value={settings.translationEngine}
            options={engineOptions.map((v) => ({ value: v, label: t(ENGINE_LABEL[v]) }))}
            disabled={locked}
            onChange={settings.onTranslationEngineChange}
          />
          {sttOptions.length > 1 && (
            <Choice
              label={t("stt_engine")}
              description={settings.sttProvider === "r2t2" ? t("stt_r2t2_desc") : t("stt_soniox_desc")}
              value={settings.sttProvider}
              options={sttOptions.map((v) => ({ value: v, label: v === "soniox" ? "Soniox" : "R2T2" }))}
              disabled={locked}
              onChange={settings.onSttProviderChange}
            />
          )}
          <Row
            label={t("audio_processing")}
            description={settings.audioProcessing ? t("audio_processing_on") : t("audio_processing_off")}
            chevron={false}
            disabled={locked}
            onClick={() => settings.onAudioProcessingChange(!settings.audioProcessing)}
            value={<Switch on={settings.audioProcessing} />}
          />

          <SectionTitle>{t("ph_section_general")}</SectionTitle>
          <Choice
            label={t("ui_language")}
            value={locale}
            options={LOCALES.map((l) => ({ value: l.code, label: l.label }))}
            onChange={(v) => setLocale(v as Locale)}
          />

          <SectionTitle>{t("ph_section_account")}</SectionTitle>
          {user && <Row label={user.name} description={user.email.toLowerCase() !== user.name.toLowerCase() ? user.email : undefined} />}
          {isAdmin && <Row label={t("admin_panel")} onClick={() => router.push("/admin")} />}
          <Row label={t("logout")} danger chevron={false} onClick={logout} />
        </div>
      </div>
    </SideSheet>
  );
}

function Choice<V extends string>({
  label,
  description,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  value: V;
  options: { value: V; label: string }[];
  disabled?: boolean;
  onChange: (v: V) => void;
}) {
  return (
    <div className="border-b border-border py-3">
      <p className="text-[15px] text-foreground">{label}</p>
      <div role="radiogroup" aria-label={label} className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`rounded-full border px-3 py-1.5 text-sm disabled:opacity-60 ${
              value === o.value ? "border-foreground bg-foreground text-background" : "border-border text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {description && <p className="mt-2 text-xs leading-snug text-gray-600">{description}</p>}
    </div>
  );
}
