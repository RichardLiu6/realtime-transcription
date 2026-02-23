"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  UserPlus,
  Trash2,
  ArrowLeft,
  Plus,
  Copy,
  XCircle,
  GitCompareArrows,
} from "lucide-react";
import Link from "next/link";

const SUPPORTED_MODELS = [
  { value: "", label: "默认 (Nano)" },
  { value: "gpt-5-nano", label: "GPT-5 Nano" },
  { value: "gpt-5-mini", label: "GPT-5 Mini" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
];

interface MonthlyUsage {
  stt_seconds: number;
  llm_input_tokens: number;
  llm_output_tokens: number;
}

interface User {
  email: string;
  name: string;
  addedAt: string;
  model?: string;
  usage?: Record<string, MonthlyUsage>;
}

interface Meeting {
  code: string;
  createdAt: string;
  expiresAt: string;
  active: boolean;
}

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Meeting code state
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingHours, setMeetingHours] = useState("4");
  const [creatingMeeting, setCreatingMeeting] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (res.ok) setUsers(data.users);
    } catch {
      setError("获取用户列表失败");
    }
  }, []);

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/meetings");
      const data = await res.json();
      if (res.ok) setMeetings(data.meetings);
    } catch {
      setError("获取会议码失败");
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchMeetings();
  }, [fetchUsers, fetchMeetings]);

  const handleCreateMeeting = async () => {
    setError("");
    setSuccess("");
    setCreatingMeeting(true);
    try {
      const res = await fetch("/api/admin/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: Number(meetingHours) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "创建失败");
        return;
      }
      setSuccess(`会议码已创建: ${data.code}`);
      fetchMeetings();
    } catch {
      setError("网络错误");
    } finally {
      setCreatingMeeting(false);
    }
  };

  const handleDeactivateMeeting = async (code: string) => {
    setError("");
    setSuccess("");
    setDeactivating(code);
    try {
      const res = await fetch("/api/admin/meetings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "操作失败");
        return;
      }
      setSuccess(`已失效: ${code}`);
      fetchMeetings();
    } catch {
      setError("网络错误");
    } finally {
      setDeactivating(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess(`已复制: ${text}`);
  };

  const handleAdd = async () => {
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "添加失败");
        return;
      }
      setSuccess(`已添加 ${data.user.email}`);
      setEmail("");
      setName("");
      fetchUsers();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userEmail: string) => {
    setError("");
    setSuccess("");
    setDeleting(userEmail);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "删除失败");
        return;
      }
      setSuccess(`已删除 ${userEmail}`);
      fetchUsers();
    } catch {
      setError("网络错误");
    } finally {
      setDeleting(null);
    }
  };

  const handleModelChange = async (userEmail: string, model: string) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, model: model || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "更新失败");
        return;
      }
      setSuccess(`已更新 ${userEmail} 的模型`);
      fetchUsers();
    } catch {
      setError("网络错误");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && email.trim() && !loading) handleAdd();
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-lg space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">用户管理</h1>
          <div className="flex gap-2">
            <Link href="/admin/compare">
              <Button variant="outline" size="sm">
                <GitCompareArrows className="size-4 mr-1" />
                模型对比
              </Button>
            </Link>
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="size-4 mr-1" />
                返回首页
              </Button>
            </Link>
          </div>
        </div>

        {/* Add user form */}
        <div className="space-y-3 rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            添加用户
          </h2>
          <div className="flex gap-2" onKeyDown={handleKeyDown}>
            <Input
              type="email"
              placeholder="邮箱地址"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
              disabled={loading}
            />
            <Input
              type="text"
              placeholder="姓名（选填）"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-32"
              disabled={loading}
            />
            <Button onClick={handleAdd} disabled={!email.trim() || loading}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Meeting codes */}
        <div className="space-y-3 rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            临时会议码
          </h2>
          <div className="flex gap-2 items-center">
            <select
              value={meetingHours}
              onChange={(e) => setMeetingHours(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              disabled={creatingMeeting}
            >
              <option value="1">1 小时</option>
              <option value="2">2 小时</option>
              <option value="4">4 小时</option>
              <option value="8">8 小时</option>
              <option value="12">12 小时</option>
              <option value="24">24 小时</option>
            </select>
            <Button
              onClick={handleCreateMeeting}
              disabled={creatingMeeting}
              className="flex-1"
            >
              {creatingMeeting ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Plus className="size-4 mr-2" />
              )}
              生成会议码
            </Button>
          </div>
          {meetings.length > 0 && (
            <div className="divide-y divide-border rounded-lg border border-border mt-2">
              {meetings.map((m) => (
                <div
                  key={m.code}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold tracking-widest">
                        {m.code}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ${
                          m.active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {m.active ? "有效" : "已过期"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      到期: {new Date(m.expiresAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-4">
                    {m.active && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => copyToClipboard(m.code)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Copy code"
                        >
                          <Copy className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDeactivateMeeting(m.code)}
                          disabled={deactivating === m.code}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Deactivate"
                        >
                          {deactivating === m.code ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <XCircle className="size-4" />
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Messages */}
        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}
        {success && (
          <p className="text-sm text-green-600 text-center">{success}</p>
        )}

        {/* User list */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            已授权用户 ({users.length})
          </h2>
          {users.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              暂无用户，请添加
            </p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {users.map((user) => {
                const monthKey = getCurrentMonthKey();
                const mu = user.usage?.[monthKey];
                const sttMin = mu ? Math.round(mu.stt_seconds / 60) : 0;
                const llmIn = mu?.llm_input_tokens ?? 0;
                const llmOut = mu?.llm_output_tokens ?? 0;
                return (
                  <div
                    key={user.email}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {user.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </p>
                      {(sttMin > 0 || llmIn > 0) && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          本月: 转录 {sttMin}分 · LLM {formatTokens(llmIn)}↑ {formatTokens(llmOut)}↓
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <select
                        value={user.model || ""}
                        onChange={(e) => handleModelChange(user.email, e.target.value)}
                        className="h-7 rounded border border-input bg-background px-1.5 text-xs text-muted-foreground"
                      >
                        {SUPPORTED_MODELS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(user.email)}
                        disabled={deleting === user.email}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {deleting === user.email ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
