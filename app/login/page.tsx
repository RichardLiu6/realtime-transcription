"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, KeyRound, Shield, Users } from "lucide-react";
import { useT, type TranslationKey } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// Server error codes (/api/auth/*) → message in the interface language
const AUTH_CODES = [
  "email_required", "email_not_allowed", "code_required", "code_expired", "code_wrong",
  "meeting_code_required", "meeting_invalid", "meeting_expired", "send_failed", "server_error",
];

type Stage = "email" | "code" | "meeting";

export default function LoginPage() {
  const t = useT();
  const authError = (data: { code?: string; error?: string }, fallback: TranslationKey) =>
    data.code && AUTH_CODES.includes(data.code)
      ? t(`auth_${data.code}` as TranslationKey)
      : data.error || t(fallback);
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [meetingCode, setMeetingCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoinMeeting = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/join-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: meetingCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(authError(data, "login_join_failed"));
        return;
      }
      window.location.href = "/";
    } catch {
      setError(t("login_network_error"));
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(authError(data, "login_send_failed"));
        return;
      }
      setChallengeToken(data.challengeToken);
      setStage("code");
    } catch {
      setError(t("login_network_error"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), challengeToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(authError(data, "login_verify_failed"));
        return;
      }
      window.location.href = "/";
    } catch {
      setError(t("login_network_error"));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      if (stage === "email" && email.trim()) handleSendCode();
      if (stage === "code" && code.trim()) handleVerifyCode();
      if (stage === "meeting" && meetingCode.trim()) handleJoinMeeting();
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <LanguageSwitcher className="absolute right-4 top-4" />
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("login_title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {stage === "email" && t("login_email_prompt")}
            {stage === "code" && t("login_code_sent", { email })}
            {stage === "meeting" && t("login_meeting_prompt")}
          </p>
        </div>

        <div className="space-y-4" onKeyDown={handleKeyDown}>
          {stage === "email" && (
            <>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  autoFocus
                  disabled={loading}
                />
              </div>
              <Button
                onClick={handleSendCode}
                disabled={!email.trim() || loading}
                className="w-full"
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : null}
                {t("login_send_code")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setStage("meeting");
                  setError("");
                }}
                className="w-full"
              >
                <Users className="size-4 mr-2" />
                {t("login_join_temp_meeting")}
              </Button>
            </>
          )}
          {stage === "code" && (
            <>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder={t("login_code_placeholder")}
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="pl-10 text-center text-lg tracking-[0.5em] font-mono"
                  autoFocus
                  disabled={loading}
                />
              </div>
              <Button
                onClick={handleVerifyCode}
                disabled={code.length !== 6 || loading}
                className="w-full"
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : null}
                {t("login_submit")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setStage("email");
                  setCode("");
                  setError("");
                }}
                className="w-full"
                disabled={loading}
              >
                {t("login_change_email")}
              </Button>
            </>
          )}
          {stage === "meeting" && (
            <>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={t("login_meeting_code_placeholder")}
                  value={meetingCode}
                  onChange={(e) =>
                    setMeetingCode(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)
                    )
                  }
                  className="pl-10 text-center text-lg tracking-[0.5em] font-mono"
                  autoFocus
                  disabled={loading}
                />
              </div>
              <Button
                onClick={handleJoinMeeting}
                disabled={meetingCode.length !== 6 || loading}
                className="w-full"
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : null}
                {t("login_join_meeting")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setStage("email");
                  setMeetingCode("");
                  setError("");
                }}
                className="w-full"
                disabled={loading}
              >
                {t("login_back")}
              </Button>
            </>
          )}
        </div>

        {error && (
          <p className="text-center text-sm text-destructive">{error}</p>
        )}

        <div className="pt-2 border-t border-border">
          <Button
            variant="outline"
            onClick={() => (window.location.href = "/admin/login")}
            className="w-full"
          >
            <Shield className="size-4 mr-2" />
            Admin Login
          </Button>
        </div>
      </div>
    </div>
  );
}
