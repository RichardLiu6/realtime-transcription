"use client";

// The phone layout's sidebar, in the style of chat apps' history drawers:
// app name and a new-meeting button on top, search, the saved meetings as
// one-line titles grouped by date, and the user with settings at the
// bottom. It follows the finger: swipe right from the left edge of the
// screen to pull it out, swipe left on it (or tap outside) to put it away.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, Search, Settings, SquarePen, Users } from "lucide-react";
import { useLocale, useT, type Locale } from "@/lib/i18n";
import { formatDateTime } from "@/lib/meetings/format";
import type { MeetingSummary } from "@/lib/meetings/types";

// A touch starting this close to the left edge can pull the drawer out
const EDGE = 24;

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // No edge swipe while something else covers the screen
  gesturesEnabled: boolean;
  recording: boolean;
  canSave: boolean;
  current: { id: string; summary: string } | null;
  userName: string;
  onNewMeeting: () => void;
  onOpenMeeting: (id: string) => void;
  onBackToRecording: () => void;
  onSettings: () => void;
}

export default function Drawer({
  open,
  onOpenChange,
  gesturesEnabled,
  recording,
  canSave,
  current,
  userName,
  onNewMeeting,
  onOpenMeeting,
  onBackToRecording,
  onSettings,
}: DrawerProps) {
  const t = useT();
  const locale = useLocale();
  const panelRef = useRef<HTMLDivElement>(null);
  // While a finger drags: how far the panel is out (0 … width), else null
  const [drag, setDragState] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const setDrag = (value: number | null) => {
    dragRef.current = value;
    setDragState(value);
  };
  const touch = useRef<{ x: number; y: number; from: number; horizontal: boolean | null } | null>(null);

  // Measured when a drag starts (render uses the last measurement)
  const [panelWidth, setPanelWidth] = useState(320);
  const width = () => {
    const w = panelRef.current?.offsetWidth || 320;
    setPanelWidth(w);
    return w;
  };

  // Pull out from the left edge (on the whole page, phone layout only)
  useEffect(() => {
    if (open || !gesturesEnabled) return;
    const start = (e: TouchEvent) => {
      const p = e.touches[0];
      if (e.touches.length !== 1 || p.clientX > EDGE || window.innerWidth >= 1024) return;
      touch.current = { x: p.clientX, y: p.clientY, from: 0, horizontal: null };
    };
    const move = (e: TouchEvent) => {
      const s = touch.current;
      if (!s) return;
      const p = e.touches[0];
      const dx = p.clientX - s.x;
      const dy = p.clientY - s.y;
      if (s.horizontal === null && Math.abs(dx) + Math.abs(dy) > 8) s.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!s.horizontal) return;
      setDrag(Math.max(0, Math.min(width(), dx)));
    };
    const end = () => {
      const s = touch.current;
      touch.current = null;
      const d = dragRef.current;
      setDrag(null);
      if (s?.horizontal && d !== null && d > width() * 0.3) onOpenChange(true);
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, [open, gesturesEnabled, onOpenChange]);

  // Push back in: swipe left on the open drawer or its backdrop
  const onTouchStart = (e: React.TouchEvent) => {
    const p = e.touches[0];
    touch.current = { x: p.clientX, y: p.clientY, from: width(), horizontal: null };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touch.current;
    if (!s) return;
    const p = e.touches[0];
    const dx = p.clientX - s.x;
    const dy = p.clientY - s.y;
    if (s.horizontal === null && Math.abs(dx) + Math.abs(dy) > 8) s.horizontal = Math.abs(dx) > Math.abs(dy) && dx < 0;
    if (!s.horizontal) return;
    setDrag(Math.max(0, Math.min(width(), s.from + dx)));
  };
  const onTouchEnd = () => {
    const s = touch.current;
    touch.current = null;
    const d = dragRef.current;
    setDrag(null);
    if (s?.horizontal && d !== null && d < width() * 0.7) onOpenChange(false);
  };

  // Esc closes; focus moves into the drawer when it opens
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onOpenChange]);

  const shown = drag !== null || open;
  const progress = drag !== null ? drag / panelWidth : open ? 1 : 0;

  return (
    <div className={`fixed inset-0 z-50 lg:hidden ${shown ? "" : "pointer-events-none"}`} aria-hidden={!shown}>
      <div
        className="absolute inset-0 bg-black"
        style={{ opacity: 0.4 * progress, transition: drag === null ? "opacity 250ms ease" : "none" }}
        onClick={() => onOpenChange(false)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("ph_menu")}
        tabIndex={-1}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="safe-top absolute inset-y-0 left-0 flex w-[84%] max-w-sm flex-col bg-background shadow-2xl outline-none"
        style={{
          transform: drag !== null ? `translateX(${drag - panelWidth}px)` : open ? "translateX(0)" : "translateX(-100%)",
          transition: drag === null ? "transform 250ms cubic-bezier(0.32, 0.72, 0, 1)" : "none",
        }}
      >
        {open && (
          <DrawerBody
            recording={recording}
            canSave={canSave}
            current={current}
            userName={userName}
            locale={locale}
            onNewMeeting={onNewMeeting}
            onOpenMeeting={onOpenMeeting}
            onBackToRecording={onBackToRecording}
            onSettings={onSettings}
          />
        )}
      </div>
    </div>
  );
}

function DrawerBody({
  recording,
  canSave,
  current,
  userName,
  locale,
  onNewMeeting,
  onOpenMeeting,
  onBackToRecording,
  onSettings,
}: Omit<DrawerProps, "open" | "onOpenChange" | "gesturesEnabled"> & { locale: Locale }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [meetings, setMeetings] = useState<MeetingSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Loaded each time the drawer opens (it mounts then) and while searching
  useEffect(() => {
    if (!canSave) return;
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
  }, [query, canSave]);

  const groups = useMemo(() => groupByDate(meetings ?? [], current?.id), [meetings, current?.id]);
  const titleOf = useCallback(
    (m: MeetingSummary) => m.title || formatDateTime(m.createdAt, locale),
    [locale]
  );

  return (
    <>
      <div className="flex items-center justify-between px-4 pb-1 pt-2">
        <span className="text-[17px] font-semibold tracking-tight text-foreground">ABL Translate</span>
        <button
          type="button"
          onClick={onNewMeeting}
          disabled={recording}
          aria-label={t("new_meeting")}
          title={recording ? t("ph_stop_first") : t("new_meeting")}
          data-drawer-new
          className="grid size-10 place-items-center rounded-full text-foreground hover:bg-muted disabled:opacity-30"
        >
          <SquarePen className="size-5" />
        </button>
      </div>

      {canSave && (
        <label className="mx-3 mt-1 flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5">
          <Search className="size-4 shrink-0 text-gray-500" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("ph_search_meetings")}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-gray-500"
          />
        </label>
      )}

      <nav className="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label={t("my_meetings")}>
        {current && !query && (
          <>
            <GroupTitle>{recording ? t("ph_recording_now") : t("ph_current")}</GroupTitle>
            <button
              type="button"
              onClick={onBackToRecording}
              className="flex w-full items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-left"
            >
              {recording && <span className="size-2 shrink-0 rounded-full bg-red-600 recording-pulse" aria-hidden />}
              <span className="truncate text-[15px] font-medium text-foreground">{current.summary}</span>
            </button>
          </>
        )}

        {failed && <p className="px-3 py-4 text-sm text-red-700">{t("ph_meetings_failed")}</p>}
        {canSave && meetings === null && !failed && (
          <div className="grid place-items-center py-6">
            <Loader2 className="size-5 animate-spin text-gray-400" />
          </div>
        )}
        {meetings && meetings.length === 0 && !failed && (
          <p className="px-3 py-4 text-sm text-gray-500">{t("ph_no_meetings")}</p>
        )}

        {groups.map((g) => (
          <div key={g.key}>
            <GroupTitle>{t(g.key)}</GroupTitle>
            {g.items.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onOpenMeeting(m.id)}
                data-drawer-meeting={m.id}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left active:bg-muted"
              >
                <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">{titleOf(m)}</span>
                {m.shared && <Users className="size-3.5 shrink-0 text-gray-400" aria-label={t("ph_shared")} />}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <button
        type="button"
        onClick={onSettings}
        className="flex items-center gap-3 border-t border-border px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-left"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background">
          {(userName || "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">{userName}</span>
        <Settings className="size-5 shrink-0 text-gray-500" aria-label={t("ph_settings_account")} />
      </button>
    </>
  );
}

function GroupTitle({ children }: { children: ReactNode }) {
  return <p className="px-3 pb-1 pt-4 text-xs font-medium text-gray-500">{children}</p>;
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
