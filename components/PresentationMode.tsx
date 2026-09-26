"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Loader2, Mic, Minus, Plus, Square, X } from "lucide-react";
import type { BilingualEntry, SpeakerInfo, TranslationMode } from "@/types/bilingual";
import { useLanguageName, useLocale, useT, type TranslationKey } from "@/lib/i18n";
import { useStoredState } from "@/lib/useStoredState";
import { meetingLanguages, sameText, sentenceIn, type SentenceText } from "@/lib/meetingLanguages";
import { FALLBACK_SPEAKER_COLOR, speakerDisplayName } from "@/hooks/useSpeakerManager";

// Presentation (projector) mode: the live captions full screen, for a room
// reading them from 3–5 m away. Modeled on Teams / Meet caption settings,
// Wordly's display modes (white or yellow on black, complete sentences only)
// and BBC subtitle guidance (left-aligned, ~70 characters per line).
// It only displays the page's state; recording is untouched by entering or
// leaving it.

export type PresentTheme = "dark" | "contrast" | "light";
export type PresentView = "both" | "single" | "side";

// Text sizes (px). 32 reads from the back of a meeting room on a 1080p
// projector; the larger steps are for big rooms.
const FONT_SIZES = [20, 24, 28, 32, 40, 48, 56, 64, 80];
const DEFAULT_FONT_SIZE = 32;

// Every text color is ≥ 7:1 on its background (WCAG AAA), the live tail too
interface ThemeColors {
  bg: string;
  text: string;
  translation: string;
  interim: string;
  muted: string;
  rule: string;
  strip: string;
  // Speaker colors are the 700 shades (for white); dark themes need light ones
  lightSpeakers: boolean;
}
const THEMES: Record<PresentTheme, ThemeColors> = {
  dark: {
    bg: "#0a0a0a",
    text: "#f5f5f5",
    translation: "#bfdbfe", // blue-200: tells the translation apart at a glance
    interim: "#a3a3a3",
    muted: "#a3a3a3",
    rule: "#525252",
    strip: "rgba(38, 38, 38, 0.94)",
    lightSpeakers: true,
  },
  contrast: {
    bg: "#000000",
    text: "#ffff00",
    translation: "#ffffff",
    interim: "#d4d400",
    muted: "#d4d400",
    rule: "#ffff00",
    strip: "rgba(0, 0, 0, 0.94)",
    lightSpeakers: true,
  },
  light: {
    bg: "#ffffff",
    text: "#111111",
    translation: "#1e3a8a", // blue-900
    interim: "#525252",
    muted: "#525252",
    rule: "#d4d4d4",
    strip: "rgba(245, 245, 245, 0.96)",
    lightSpeakers: false,
  },
};

// The 300 shades of SPEAKER_COLORS (same hue per speaker), for dark
// backgrounds — keep in step with that list
const LIGHT_SPEAKER_COLORS: Record<string, string> = {
  "#1d4ed8": "#93c5fd",
  "#047857": "#6ee7b7",
  "#7e22ce": "#d8b4fe",
  "#b45309": "#fcd34d",
  "#0e7490": "#67e8f9",
  "#a21caf": "#f0abfc",
  "#4d7c0f": "#bef264",
  "#4338ca": "#a5b4fc",
  [FALLBACK_SPEAKER_COLOR]: "#d4d4d8",
};

// Only the latest sentences can fit on screen anyway
const MAX_SENTENCES = 30;
// Controls hide after this long without mouse / touch / keyboard activity
const CONTROLS_HIDE_MS = 3000;

const isFontSize = (v: unknown): v is number => typeof v === "number" && FONT_SIZES.includes(v);
const isTheme = (v: unknown): v is PresentTheme => v === "dark" || v === "contrast" || v === "light";
const isView = (v: unknown): v is PresentView => v === "both" || v === "single" || v === "side";
const isString = (v: unknown): v is string => typeof v === "string";
const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";

// Typing in a field: F is a letter there, not the shortcut (a checkbox or
// button takes no text, so F still works there)
const NON_TEXT_INPUTS = ["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"];
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.includes(target.type);
}

// Open / close, with the F shortcut and the Fullscreen API. Full screen is
// best effort: without it (iOS Safari, iframes) the mode is a full-viewport
// overlay.
export function usePresentationMode() {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  // Only a full screen this mode entered is left again by it
  const ownFullscreen = useRef(false);

  const enter = useCallback(() => {
    openRef.current = true;
    setOpen(true);
    const el = document.documentElement;
    if (!document.fullscreenElement && typeof el.requestFullscreen === "function") {
      el.requestFullscreen()
        .then(() => {
          ownFullscreen.current = true;
        })
        .catch(() => {
          // refused (no user gesture, not allowed): the overlay alone
        });
    }
  }, []);

  const exit = useCallback(() => {
    openRef.current = false;
    setOpen(false);
    if (ownFullscreen.current) {
      ownFullscreen.current = false;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  }, []);

  const toggle = useCallback(() => (openRef.current ? exit() : enter()), [enter, exit]);

  useEffect(() => {
    // Esc in full screen is taken by the browser (no keydown reaches the
    // page): leaving full screen leaves the mode too
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && ownFullscreen.current) {
        ownFullscreen.current = false;
        openRef.current = false;
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.key === "Escape" && openRef.current) {
        e.preventDefault();
        exit();
        return;
      }
      if ((e.key === "f" || e.key === "F") && !e.isComposing && !isTypingTarget(e.target)) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [exit, toggle]);

  return { open, enter, exit, toggle };
}

interface PresentationModeProps {
  entries: BilingualEntry[];
  speakers: Map<string, SpeakerInfo>;
  translationMode: TranslationMode;
  languageA: string[];
  languageB: string;
  targetLangs: string[];
  recordingState: "idle" | "connecting" | "recording";
  elapsedSeconds: number;
  onStart: () => void;
  onStop: () => void;
  onExit: () => void;
}

// One sentence's text: confirmed part, lighter live tail; a provisional
// translation keeps the dotted underline used everywhere else (not a fade)
function Caption({ s, colors }: { s: SentenceText; colors: ThemeColors }) {
  return (
    <>
      <span
        data-provisional={s.provisional || undefined}
        style={
          s.provisional
            ? {
                textDecorationLine: "underline",
                textDecorationStyle: "dotted",
                textDecorationColor: colors.muted,
                textDecorationThickness: "0.06em",
                textUnderlineOffset: "0.22em",
              }
            : undefined
        }
      >
        {s.text}
      </span>
      {s.interim && (
        <span data-interim style={{ color: colors.interim }}>
          {s.interim}
        </span>
      )}
    </>
  );
}

function SpeakerLine({ name, color }: { name: string; color: string }) {
  return (
    <div
      data-present-speaker
      className="flex items-center gap-2 font-semibold"
      style={{ color, fontSize: "max(14px, 0.5em)", lineHeight: 1.3, marginBottom: "0.1em" }}
    >
      <span aria-hidden className="inline-block size-[0.6em] shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </div>
  );
}

// A segmented control for the strip
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      <span className="mr-1 hidden text-xs opacity-80 xl:inline">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className="rounded-md border border-current/30 px-2 py-1 text-xs whitespace-nowrap hover:border-current aria-checked:bg-[var(--p-text)] aria-checked:text-[var(--p-bg)] aria-checked:border-[var(--p-text)]"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const THEME_LABEL: Record<PresentTheme, TranslationKey> = {
  dark: "theme_dark",
  contrast: "theme_contrast",
  light: "theme_light",
};
const VIEW_LABEL: Record<PresentView, TranslationKey> = {
  both: "view_both",
  single: "view_single",
  side: "view_side",
};

export default function PresentationMode({
  entries,
  speakers,
  translationMode,
  languageA,
  languageB,
  targetLangs,
  recordingState,
  elapsedSeconds,
  onStart,
  onStop,
  onExit,
}: PresentationModeProps) {
  const t = useT();
  const locale = useLocale();
  const langName = useLanguageName();
  const [fontSize, setFontSize] = useStoredState("presentFontSize", DEFAULT_FONT_SIZE, isFontSize);
  const [theme, setTheme] = useStoredState<PresentTheme>("presentTheme", "dark", isTheme);
  const [storedView, setView] = useStoredState<PresentView>("presentView", "both", isView);
  const [storedLang, setLang] = useStoredState("presentLanguage", "", isString);
  const [finalOnly, setFinalOnly] = useStoredState("presentFinalOnly", false, isBoolean);
  const colors = THEMES[theme];

  const langs = meetingLanguages(translationMode, languageA, languageB, targetLangs, entries);
  // Side by side needs exactly two languages (A left, B right)
  const view: PresentView = storedView === "side" && langs.length !== 2 ? "both" : storedView;
  // "My language": the stored choice, else the interface language when the
  // meeting has it, else the second language (usually the translation)
  const lang = langs.includes(storedLang)
    ? storedLang
    : langs.includes(locale)
      ? locale
      : (langs[1] ?? langs[0] ?? "en");

  // --- Controls: shown on activity, hidden after a few idle seconds
  const [controlsVisible, setControlsVisible] = useState(true);
  const stripRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The pointer has moved over the strip. Merely resting there doesn't
  // count: after clicking 演示模式 (top right) the mouse sits right on the
  // exit button, and the controls would never hide on a projector.
  const pointerOnStrip = useRef(false);
  const armHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const hide = () => {
      const strip = stripRef.current;
      // Not while the pointer is on them or keyboard focus is in them
      if (strip && ((pointerOnStrip.current && strip.matches(":hover")) || strip.querySelector(":focus-visible"))) {
        hideTimer.current = setTimeout(hide, CONTROLS_HIDE_MS);
        return;
      }
      setControlsVisible(false);
    };
    hideTimer.current = setTimeout(hide, CONTROLS_HIDE_MS);
  }, []);
  const poke = useCallback(() => {
    setControlsVisible(true);
    armHide();
  }, [armHide]);
  // Shown on entering, then hidden like after any activity
  useEffect(() => {
    armHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [armHide]);

  // Take focus (so Esc / F land here, not in a field behind), give it back
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  // --- Captions
  const visible = entries
    .filter((e) => e.isFinal || (!finalOnly && (e.originalText || e.interimOriginal)))
    .slice(-MAX_SENTENCES);
  // Complete sentences only: no live tail and no translation still being revised
  const settled = (s: SentenceText | null): SentenceText | null =>
    s && finalOnly ? (s.provisional ? null : { ...s, interim: "" }) : s;
  const originalOf = (e: BilingualEntry): SentenceText | null =>
    settled(
      e.originalText || e.interimOriginal
        ? { text: e.originalText, interim: e.isFinal ? "" : (e.interimOriginal ?? ""), provisional: false, isOriginal: true }
        : null
    );
  // The translation under the original in the "both" view: the single
  // translation (two-way / one-way), or the chosen language's column
  const translationOf = (e: BilingualEntry): SentenceText | null => {
    if (translationMode === "presentation") {
      const text = e.translations?.[lang];
      if (!text || sameText(text, e.originalText)) return null;
      return settled({ text, interim: "", provisional: !!e.translationProvisional, isOriginal: false });
    }
    return e.translatedText
      ? settled({ text: e.translatedText, interim: "", provisional: !!e.translationProvisional, isOriginal: false })
      : null;
  };
  const inLang = (e: BilingualEntry, l: string) =>
    settled(sentenceIn(e, l, translationMode, languageA, languageB));

  const speakerColor = (id: string) => {
    const base = speakers.get(id)?.color ?? FALLBACK_SPEAKER_COLOR;
    return colors.lightSpeakers ? (LIGHT_SPEAKER_COLORS[base] ?? "#d4d4d8") : base;
  };

  const items: ReactNode[] = [];
  let lastSpeaker: string | null = null;
  for (const e of visible) {
    let body: ReactNode = null;
    if (view === "both") {
      const original = originalOf(e);
      const translation = translationOf(e);
      if (!original) continue;
      body = (
        <>
          <p data-present-original>
            <Caption s={original} colors={colors} />
          </p>
          {translation && (
            <p
              data-present-translation
              style={{
                color: colors.translation,
                fontSize: "0.9em",
                borderLeft: `0.08em solid ${colors.rule}`,
                paddingLeft: "0.5em",
                marginTop: "0.1em",
              }}
            >
              <Caption s={translation} colors={colors} />
            </p>
          )}
        </>
      );
    } else if (view === "single") {
      const s = inLang(e, lang);
      if (!s) continue;
      body = (
        <p data-present-text style={s.isOriginal ? undefined : { color: colors.translation }}>
          <Caption s={s} colors={colors} />
        </p>
      );
    } else {
      const left = inLang(e, langs[0]);
      const right = inLang(e, langs[1]);
      if (!left && !right) continue;
      body = (
        <div className="grid grid-cols-2" style={{ columnGap: "2em" }}>
          {[left, right].map((s, i) => (
            <p key={i} data-side={i === 0 ? "a" : "b"} style={s && !s.isOriginal ? { color: colors.translation } : undefined}>
              {s && <Caption s={s} colors={colors} />}
            </p>
          ))}
        </div>
      );
    }
    const showSpeaker = e.speaker !== lastSpeaker;
    lastSpeaker = e.speaker;
    items.push(
      <div
        key={e.id}
        data-present-item
        className="shrink-0"
        style={{ marginTop: showSpeaker ? "0.6em" : "0.35em" }}
      >
        {showSpeaker && (
          <SpeakerLine
            name={speakerDisplayName(e.speaker, speakers.get(e.speaker)?.label, t)}
            color={speakerColor(e.speaker)}
          />
        )}
        {body}
      </div>
    );
  }

  const isRecording = recordingState === "recording";
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");
  const sizeIndex = FONT_SIZES.indexOf(fontSize);

  const viewOptions = (["both", "single", "side"] as const)
    .filter((v) => v !== "side" || langs.length === 2)
    .map((v) => ({ value: v, label: t(VIEW_LABEL[v]) }));
  // Which language: for one language, or the column shown under the
  // original in multilingual mode
  const showLanguagePicker =
    langs.length > 1 && (view === "single" || (view === "both" && translationMode === "presentation"));

  const style = {
    backgroundColor: colors.bg,
    color: colors.text,
    colorScheme: theme === "light" ? "light" : "dark",
    "--p-text": colors.text,
    "--p-bg": colors.bg,
    cursor: controlsVisible ? undefined : "none",
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("present")}
      data-presentation
      data-theme={theme}
      tabIndex={-1}
      onMouseMove={poke}
      onPointerDown={poke}
      onKeyDown={poke}
      className="fixed inset-0 z-[100] flex flex-col outline-none"
      style={style}
    >
      {/* Control strip: over the captions (they never move when it shows) */}
      <div
        ref={stripRef}
        role="toolbar"
        aria-label={t("present_controls")}
        data-present-controls
        data-visible={controlsVisible || undefined}
        onFocus={poke}
        onMouseMove={() => {
          pointerOnStrip.current = true;
        }}
        onMouseLeave={() => {
          pointerOnStrip.current = false;
        }}
        className={`absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm shadow-lg transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ backgroundColor: colors.strip, borderBottom: `1px solid ${colors.rule}` }}
      >
        {/* Recording: state + timer, start / stop (same handlers as the page) */}
        <div className="flex items-center gap-2">
          {isRecording && (
            <>
              <span className="size-2.5 shrink-0 rounded-full bg-red-500 recording-pulse" />
              <span className="sr-only">{t("recording_status")}</span>
              <span className="font-mono font-semibold tabular-nums">
                {minutes}:{seconds}
              </span>
            </>
          )}
          {isRecording ? (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              <Square className="size-3.5" />
              {t("stop_recording")}
            </button>
          ) : (
            <button
              type="button"
              onClick={onStart}
              disabled={recordingState === "connecting"}
              className="inline-flex items-center gap-1.5 rounded-md border border-current/40 px-2.5 py-1 text-xs font-medium hover:border-current disabled:opacity-60"
            >
              {recordingState === "connecting" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Mic className="size-3.5" />
              )}
              {recordingState === "connecting" ? t("connecting") : t("start_recording")}
            </button>
          )}
        </div>

        {/* Text size */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t("present_smaller")}
            title={t("present_smaller")}
            disabled={sizeIndex <= 0}
            onClick={() => setFontSize(FONT_SIZES[Math.max(0, sizeIndex - 1)])}
            className="inline-flex h-7 items-center gap-0.5 rounded-md border border-current/30 px-1.5 text-xs hover:border-current disabled:opacity-40"
          >
            A<Minus className="size-3" />
          </button>
          <span className="w-10 text-center text-xs tabular-nums" aria-live="polite">
            {fontSize}px
          </span>
          <button
            type="button"
            aria-label={t("present_larger")}
            title={t("present_larger")}
            disabled={sizeIndex >= FONT_SIZES.length - 1}
            onClick={() => setFontSize(FONT_SIZES[Math.min(FONT_SIZES.length - 1, sizeIndex + 1)])}
            className="inline-flex h-7 items-center gap-0.5 rounded-md border border-current/30 px-1.5 text-sm font-semibold hover:border-current disabled:opacity-40"
          >
            A<Plus className="size-3" />
          </button>
        </div>

        <Choice
          label={t("present_theme")}
          value={theme}
          options={(["dark", "contrast", "light"] as const).map((v) => ({ value: v, label: t(THEME_LABEL[v]) }))}
          onChange={setTheme}
        />

        <Choice label={t("present_view")} value={view} options={viewOptions} onChange={setView} />

        {showLanguagePicker && (
          <label className="flex items-center gap-1.5 text-xs">
            <span className="opacity-80">{t("present_language")}</span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="rounded-md border border-current/30 px-1.5 py-1 text-xs"
              style={{ backgroundColor: colors.bg, color: colors.text }}
            >
              {langs.map((l) => (
                <option key={l} value={l}>
                  {langName(l)}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={finalOnly}
            onChange={(e) => setFinalOnly(e.target.checked)}
            className="size-3.5"
            style={{ accentColor: colors.text }}
          />
          {t("present_final_only")}
        </label>

        <button
          type="button"
          onClick={onExit}
          aria-label={t("present_exit")}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-current/30 px-2.5 py-1 text-xs hover:border-current"
        >
          <X className="size-3.5" />
          <span>{t("present_exit")}</span>
        </button>
      </div>

      {/* Captions: anchored to the bottom, so the live sentence stays in
          one place and older ones scroll off the top (faded). The column
          is ~70 characters wide (in the caption font), left-aligned. */}
      <div className="flex min-h-0 flex-1 overflow-hidden" style={{ padding: "4vh max(16px, 4vw)" }}>
        <div
          className="mx-auto flex h-full w-full min-w-0 flex-col"
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: 1.45,
            // ~70 characters, and at most ~68% of a wide screen (BBC
            // subtitle guidance); the full width on a phone
            maxWidth: view === "side" ? "calc(140ch + 2em)" : "min(70ch, max(68vw, min(100%, 640px)))",
          }}
        >
          {/* Side by side: which language is which, above the captions */}
          {view === "side" && (
            <div
              data-side-headers
              className="grid shrink-0 grid-cols-2 font-semibold"
              style={{ columnGap: "2em", fontSize: "max(14px, 0.45em)", color: colors.muted }}
            >
              <span>{langName(langs[0])}</span>
              <span>{langName(langs[1])}</span>
            </div>
          )}
          <div
            role="log"
            aria-live="polite"
            data-present-log
            className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden"
            style={{
              maskImage: "linear-gradient(to bottom, transparent 0, #000 25%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 25%)",
            }}
          >
            {items.length > 0 ? (
              items
            ) : (
              <p
                className="shrink-0 self-center text-center"
                style={{ color: colors.muted, fontSize: "max(18px, 0.7em)" }}
              >
                {isRecording ? t("listening") : t("present_empty")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
