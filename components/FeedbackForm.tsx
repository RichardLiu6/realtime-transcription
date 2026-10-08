"use client";

// Feedback box: a message to the owner (POST /api/feedback, listed on the
// admin page). Device details go along automatically so a report about,
// say, floating captions says which phone and app it came from; a caller
// adds its own state through `context`.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLocale, useT, type TranslationKey } from "@/lib/i18n";
import { isNativeApp } from "@/lib/native/stt";

const MAX_MESSAGE = 2000;

interface FeedbackFormProps {
  topic: "general" | "pip";
  context?: () => Record<string, unknown> | Promise<Record<string, unknown>>;
  onSent?: () => void;
}

type Status = "idle" | "sending" | "sent" | Extract<TranslationKey, "fb_failed" | "fb_rate_limited" | "fb_guest">;

function baseContext(): Record<string, unknown> {
  return {
    locale: getLocale(),
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    nativeApp: isNativeApp(),
    path: window.location.pathname,
  };
}

export default function FeedbackForm({ topic, context, onSent }: FeedbackFormProps) {
  const t = useT();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const send = async () => {
    const text = message.trim();
    if (!text || status === "sending") return;
    setStatus("sending");
    try {
      // The caller's state is a bonus: a failure there doesn't stop the message
      const extra = context ? await Promise.resolve(context()).catch(() => ({})) : {};
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, message: text, context: { ...baseContext(), ...extra } }),
      });
      if (res.ok) {
        setStatus("sent");
        setMessage("");
        onSent?.();
        return;
      }
      setStatus(res.status === 429 ? "fb_rate_limited" : res.status === 403 ? "fb_guest" : "fb_failed");
    } catch {
      setStatus("fb_failed");
    }
  };

  const failed = status !== "idle" && status !== "sending" && status !== "sent";

  return (
    <div className="space-y-2">
      <textarea
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          if (status !== "sending") setStatus("idle");
        }}
        placeholder={t("fb_placeholder")}
        aria-label={t("fb_title")}
        maxLength={MAX_MESSAGE}
        rows={5}
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm"
      />
      <div className="flex items-center justify-between gap-3">
        <p role="status" className={`min-w-0 text-sm ${failed ? "text-destructive" : "text-emerald-700"}`}>
          {status === "sent" ? t("fb_sent") : failed ? t(status) : ""}
        </p>
        <Button type="button" size="sm" onClick={send} disabled={!message.trim() || status === "sending"}>
          {status === "sending" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {t("fb_send")}
        </Button>
      </div>
    </div>
  );
}
