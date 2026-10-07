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
  Plus,
  Search,
  Square,
  X,
} from "lucide-react";
import TermsPanel from "@/components/sidebar/TermsPanel";
import SpeakerPanel from "@/components/sidebar/SpeakerPanel";
import { LiveSharePanel } from "@/components/LiveShareButton";
import { INDUSTRY_PRESETS } from "@/lib/contextTerms";
import { LOCALES, setLocale, useLocale, useT, type Locale, type TranslationKey } from "@/lib/i18n";
import { formatDateTime } from "@/lib/meetings/format";
import type { MeetingSummary } from "@/lib/meetings/types";
import type { BilingualEntry, CaptureSource, SpeakerInfo, SttProvider, TranslationEngine, TranslationMode } from "@/types/bilingual";
import type { MeetingSettingsSetters } from "@/lib/phoneModes";
import type { SaveStatus } from "@/hooks/useMeetingAutosave";
import MeetingSettings, { useMeetingSummary } from "./MeetingSettings";
import { BottomSheet, Row, SectionTitle, SideSheet } from "./parts";


export interface PhoneChromeProps {
  children: ReactNode;
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
  const isRecording = recordingState === "recording";
  const isConnecting = recordingState === "connecting";
  const busy = recordingState !== "idle";
  const hasEntries = entries.length > 0;
  // Nothing yet: the big start button takes the middle of the screen
  const empty = !hasEntries && !isRecording;

  const summary = useMeetingSummary(props.translationMode, props.languageA, props.languageB, props.targetLangs);
  const close = useCallback(() => setSheet(null), []);
  const open = (s: Sheet) => () => setSheet(s);

  const termsLabel = useMemo(() => {
    const names = Array.from(props.selectedPresets)
      .map((k) => INDUSTRY_PRESETS[k] && t(`preset_${k}` as TranslationKey))
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
              <span />
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
        <div className="-mx-5">
          <TermsPanel
            termsText={props.termsText}
            onTermsTextChange={props.onTermsTextChange}
            selectedPresets={props.selectedPresets}
            onSelectedPresetsChange={props.onSelectedPresetsChange}
            customTerms={props.customTerms}
            onCustomTermsChange={props.onCustomTermsChange}
            isRecording={isRecording}
            inline
          />
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "speakers"} onOpenChange={(o) => setSheet(o ? "speakers" : null)} title={t("speakers")}>
        <div className="-mx-5">
          <SpeakerPanel speakers={props.speakers} entries={entries} onRenameSpeaker={props.onRenameSpeaker} />
        </div>
      </BottomSheet>

      <Drawer
        open={sheet === "drawer"}
        onOpenChange={(o) => setSheet(o ? "drawer" : null)}
        recording={busy}
        canSave={props.save.available}
        current={props.save.meetingId && (hasEntries || busy) ? { id: props.save.meetingId, summary } : null}
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

      {viewing && <MeetingViewer id={viewing} onClose={() => setViewing(null)} />}
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

// --- Sidebar: new meeting, saved meetings, settings & account ---

function Drawer({
  open,
  onOpenChange,
  recording,
  canSave,
  current,
  onNewMeeting,
  onOpenMeeting,
  onBackToRecording,
  onSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recording: boolean;
  canSave: boolean;
  current: { id: string; summary: string } | null;
  onNewMeeting: () => void;
  onOpenMeeting: (id: string) => void;
  onBackToRecording: () => void;
  onSettings: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const user = useUser();
  const [query, setQuery] = useState("");
  const [meetings, setMeetings] = useState<MeetingSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Loaded each time the sidebar opens (and while typing a search)
  useEffect(() => {
    if (!open || !canSave) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        fetch(`/api/meetings?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: "no-store" })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then((d) => {
            setMeetings(d.meetings ?? []);
            setFailed(false);
          })
          .catch((e) => {
            if (e?.name !== "AbortError") setFailed(true);
          });
      },
      query ? 300 : 0
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, canSave]);

  const groups = useMemo(() => groupByDate(meetings ?? [], current?.id), [meetings, current?.id]);

  return (
    <SideSheet open={open} onOpenChange={onOpenChange} side="left" title={t("ph_menu")} className="w-[86%] max-w-sm">
      <div className="flex h-full min-h-0 flex-col pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="space-y-2 px-3 pt-3">
          <button
            type="button"
            onClick={onNewMeeting}
            disabled={recording}
            className="flex h-11 w-full items-center gap-2 rounded-xl bg-foreground px-3 text-[15px] font-semibold text-background disabled:opacity-50"
          >
            <Plus className="size-5" aria-hidden />
            {t("new_meeting")}
            {recording && <span className="ml-auto text-xs font-normal opacity-80">{t("ph_stop_first")}</span>}
          </button>
          <label className={`flex items-center gap-2 rounded-xl bg-muted px-3 py-2 ${canSave ? "" : "hidden"}`}>
            <Search className="size-4 text-gray-600" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("ph_search_meetings")}
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
            />
          </label>
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2">
          {current && !query && (
            <>
              <DrawerTitle>{recording ? t("ph_recording_now") : t("ph_current")}</DrawerTitle>
              <button
                type="button"
                onClick={onBackToRecording}
                className={`w-full rounded-lg px-2 py-2 text-left ${recording ? "bg-red-50" : "bg-muted"}`}
              >
                <span className={`flex items-center gap-1.5 text-[15px] font-semibold ${recording ? "text-red-700" : "text-foreground"}`}>
                  {recording && <span className="size-2 rounded-full bg-red-600 recording-pulse" aria-hidden />}
                  <span className="truncate">{current.summary}</span>
                </span>
                <span className="block text-xs text-gray-600">{t("ph_back_to_recording")}</span>
              </button>
            </>
          )}
          {failed && <p className="px-2 py-4 text-sm text-red-700">{t("ph_meetings_failed")}</p>}
          {meetings && meetings.length === 0 && !failed && (
            <p className="px-2 py-4 text-sm text-gray-600">{t("ph_no_meetings")}</p>
          )}
          {meetings === null && !failed && canSave && (
            <div className="grid place-items-center py-6">
              <Loader2 className="size-5 animate-spin text-gray-500" />
            </div>
          )}
          {groups.map((g) => (
            <div key={g.key}>
              <DrawerTitle>{t(g.key)}</DrawerTitle>
              {g.items.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onOpenMeeting(m.id)}
                  className="w-full rounded-lg px-2 py-2 text-left hover:bg-muted"
                >
                  <span className="block truncate text-[15px] text-foreground">
                    {m.title || formatDateTime(m.createdAt, locale)}
                  </span>
                  <span className="block truncate text-xs text-gray-600">
                    {[
                      m.title ? formatDateTime(m.createdAt, locale) : null,
                      t("ph_min", { n: Math.max(1, Math.round(m.durationMs / 60000)) }),
                      m.recordingCount > 0 ? t("ph_with_audio") : null,
                      m.shared ? t("ph_shared") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onSettings}
          className="mx-2 mt-2 flex items-center gap-3 rounded-xl border-t border-border px-2 pt-3 text-left"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background">
            {(user?.name ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{user?.name ?? ""}</span>
            <span className="block text-xs text-gray-600">{t("ph_settings_account")}</span>
          </span>
        </button>
      </div>
    </SideSheet>
  );
}

function DrawerTitle({ children }: { children: ReactNode }) {
  return <p className="px-2 pb-1 pt-4 text-xs font-medium text-gray-600">{children}</p>;
}

function groupByDate(meetings: MeetingSummary[], skipId?: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgo = today - 6 * 86400000;
  const buckets: Record<"ph_today" | "ph_this_week" | "ph_earlier", MeetingSummary[]> = {
    ph_today: [],
    ph_this_week: [],
    ph_earlier: [],
  };
  for (const m of meetings) {
    if (m.id === skipId) continue;
    const time = new Date(m.createdAt).getTime();
    buckets[time >= today ? "ph_today" : time >= weekAgo ? "ph_this_week" : "ph_earlier"].push(m);
  }
  return (Object.keys(buckets) as (keyof typeof buckets)[])
    .filter((k) => buckets[k].length > 0)
    .map((key) => ({ key, items: buckets[key] }));
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

// --- A saved meeting, inside the app: the page in a frame over the
// recording screen, so a recording carries on underneath ---

function MeetingViewer({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  return (
    <div className="safe-top safe-x fixed inset-0 z-[70] flex flex-col bg-background lg:hidden" role="dialog" aria-modal>
      <div className="flex shrink-0 items-center border-b border-border px-2 py-1.5">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[15px] text-blue-700"
        >
          <X className="size-5" aria-hidden />
          {t("ph_close")}
        </button>
      </div>
      <iframe src={`/meetings/${id}`} title={t("my_meetings")} className="min-h-0 w-full flex-1 border-0" />
    </div>
  );
}
