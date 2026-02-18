"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, User, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StatusBarProps {
  recordingState: "idle" | "connecting" | "recording";
  elapsedSeconds: number;
  error: string | null;
  mobileVariant?: 1 | 2 | 3;
  onMobileVariantChange?: (v: 1 | 2 | 3) => void;
}

export default function StatusBar({
  recordingState,
  elapsedSeconds,
  error,
  mobileVariant,
  onMobileVariantChange,
}: StatusBarProps) {
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
        {/* Left: recording status (desktop) + variant picker (mobile) */}
        <div className="flex items-center gap-3">
          {/* Desktop: recording status */}
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
                Connecting...
              </span>
            </div>
          )}

          {/* Mobile: variant picker (for testing) */}
          {mobileVariant && onMobileVariantChange && (
            <div className="flex lg:hidden items-center gap-1">
              {([1, 2, 3] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onMobileVariantChange(v)}
                  className={`h-6 w-6 rounded text-xs font-medium transition-colors ${
                    mobileVariant === v
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {v}
                </button>
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
