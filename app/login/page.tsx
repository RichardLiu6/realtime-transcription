"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, KeyRound, Shield, Users } from "lucide-react";

type Stage = "email" | "code" | "meeting";

export default function LoginPage() {
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
        setError(data.error || "加入失败");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("网络错误，请重试");
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
        setError(data.error || "发送失败");
        return;
      }
      setChallengeToken(data.challengeToken);
      setStage("code");
    } catch {
      setError("网络错误，请重试");
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
        setError(data.error || "验证失败");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("网络错误，请重试");
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            实时转录
          </h1>
          <p className="text-sm text-muted-foreground">
            {stage === "email" && "输入邮箱获取验证码"}
            {stage === "code" && `验证码已发送至 ${email}`}
            {stage === "meeting" && "输入会议码加入临时会议"}
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
                发送验证码
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
                加入临时会议
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
                  placeholder="6 位验证码"
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
                登录
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
                更换邮箱
              </Button>
            </>
          )}
          {stage === "meeting" && (
            <>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="6 位会议码"
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
                加入会议
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
                返回登录
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
