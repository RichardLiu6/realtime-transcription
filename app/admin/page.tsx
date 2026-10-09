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
import { MODEL_POOL } from "@/lib/models";

// Pool: every model ≤ $0.5 per million tokens (input and output)
const SUPPORTED_MODELS = [
  { value: "", label: "默认（Seed 2.0 Mini）" },
  ...MODEL_POOL.map((m) => ({ value: m.id, label: `${m.label} · $${m.price}/M` })),
];

interface UsageUser {
  email: string;
  sttSeconds: number;
  translateCalls: number;
  provisionalCalls: number;
  summaryCalls: number;
  inputTokens: number;
  outputTokens: number;
  llmCostUsd: number;
  sttCostUsd: number;
  totalUsd: number;
  models: { model: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number }[];
}

interface UsageResponse {
  month: string;
  months: string[];
  users: UsageUser[];
  sonioxUsdPerHour: number;
  stt?: {
    source: "soniox" | "estimate";
    sonioxTotalUsd: number | null;
    syncedAt: string | null;
    error: string | null;
  };
}

const usd = (n: number) => (n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);

interface SavedMeetingRow {
  ownerEmail: string;
  createdAt: string;
  durationMs: number;
  entryCount: number;
  recordingBytes: number;
  sharedWith: number;
}

interface FeedbackRow {
  id: string;
  email: string;
  createdAt: string;
  topic: string;
  message: string;
  context: Record<string, unknown> | null;
}

const FEEDBACK_TOPIC_LABEL: Record<string, string> = { general: "通用", pip: "悬浮字幕" };

// A context value as a short chip text (objects as JSON)
function contextValue(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

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

  // Usage and cost per user and month (Postgres, lib/usage.ts)
  const [usageMonth, setUsageMonth] = useState("");
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  useEffect(() => {
    fetch(`/api/admin/usage${usageMonth ? `?month=${usageMonth}` : ""}`)
      .then((r) => r.json())
      .then((d) => setUsage(d.available ? d : null))
      .catch(() => {});
  }, [usageMonth]);

  // Saved meetings: a content-free overview (who, when, how long, how big)
  const [savedMeetings, setSavedMeetings] = useState<SavedMeetingRow[] | null>(null);
  useEffect(() => {
    fetch("/api/admin/saved-meetings")
      .then((r) => r.json())
      .then((d) => setSavedMeetings(d.available ? d.meetings : null))
      .catch(() => {});
  }, []);

  // User feedback (FeedbackForm → /api/feedback), latest 200
  const [feedback, setFeedback] = useState<FeedbackRow[] | null>(null);
  useEffect(() => {
    fetch("/api/admin/feedback")
      .then((r) => r.json())
      .then((d) => setFeedback(d.available ? d.feedback : null))
      .catch(() => {});
  }, []);

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
      <div className="mx-auto max-w-2xl space-y-8">
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

        {/* Usage and cost: translation cost as reported by OpenRouter,
            transcription as billed by Soniox (its usage logs), or estimated
            from its list price for months before per-user attribution */}
        {usage && (
          <div className="space-y-3" data-admin-usage>
            <div className="flex items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">用量与费用</h2>
                <p className="text-xs text-muted-foreground">
                  翻译费用为 OpenRouter 返回的实际金额（含说话中的临时翻译和会议纪要）；
                  {usage.stt?.source === "soniox"
                    ? "转录时长和费用为 Soniox 用量记录中的实际值。"
                    : `转录按 Soniox $${usage.sonioxUsdPerHour}/小时估算（这个月份还没有按用户的 Soniox 记录）。`}
                  按 UTC 月份统计，2026 年 9 月起。
                </p>
              </div>
              <select
                value={usage.month}
                onChange={(e) => setUsageMonth(e.target.value)}
                aria-label="月份"
                className="h-8 shrink-0 rounded border border-input bg-background px-2 text-xs"
              >
                {usage.months.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            {usage.users.length === 0 ? (
              <p className="text-sm text-muted-foreground">本月暂无用量</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">用户</th>
                      <th className="px-2 py-1.5 text-right font-medium">转录</th>
                      <th className="px-2 py-1.5 text-right font-medium" title="整句 / 临时 / 纪要">翻译调用</th>
                      <th className="px-2 py-1.5 text-right font-medium" title="输入 / 输出">Tokens</th>
                      <th className="px-2 py-1.5 text-right font-medium">翻译</th>
                      <th className="px-2 py-1.5 text-right font-medium">{usage.stt?.source === "soniox" ? "转录" : "转录≈"}</th>
                      <th className="px-2 py-1.5 text-right font-medium">合计</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {usage.users.map((u) => (
                      <tr key={u.email} data-usage-user={u.email}>
                        <td
                          className="max-w-36 truncate px-2 py-1.5"
                          title={u.models
                            .map((m) => `${m.model}: ${m.calls} 次, ${formatTokens(m.inputTokens)}↑ ${formatTokens(m.outputTokens)}↓, ${usd(m.costUsd)}`)
                            .join("\n")}
                        >
                          {u.email === "guest"
                            ? "访客（会议码）"
                            : u.email === ""
                              ? "未标记转录"
                              : u.email}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{Math.round(u.sttSeconds / 60)} 分</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                          {u.translateCalls} / {u.provisionalCalls} / {u.summaryCalls}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                          {formatTokens(u.inputTokens)}↑ {formatTokens(u.outputTokens)}↓
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{usd(u.llmCostUsd)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{usd(u.sttCostUsd)}</td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">{usd(u.totalUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border bg-muted/30 font-medium">
                    <tr data-usage-total>
                      <td className="px-2 py-1.5">合计</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {Math.round(usage.users.reduce((n, u) => n + u.sttSeconds, 0) / 60)} 分
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {usage.users.reduce((n, u) => n + u.translateCalls + u.provisionalCalls + u.summaryCalls, 0)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {formatTokens(usage.users.reduce((n, u) => n + u.inputTokens, 0))}↑{" "}
                        {formatTokens(usage.users.reduce((n, u) => n + u.outputTokens, 0))}↓
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{usd(usage.users.reduce((n, u) => n + u.llmCostUsd, 0))}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{usd(usage.users.reduce((n, u) => n + u.sttCostUsd, 0))}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{usd(usage.users.reduce((n, u) => n + u.totalUsd, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground" data-usage-stt-note>
              鼠标停在用户上可以看到按模型的明细。
              {usage.users.some((u) => u.email === "") && <> “未标记转录”是没有带用户的 Soniox 请求：按用户统计开始之前的，或在 Soniox 控制台里用的。</>}
              {usage.stt?.source === "estimate" && usage.stt.sonioxTotalUsd !== null && usage.stt.sonioxTotalUsd > 0 && (
                <> Soniox 本月实际账单 {usd(usage.stt.sonioxTotalUsd)}（未按用户区分）。</>
              )}
              {usage.stt?.syncedAt && <> Soniox 数据更新于 {new Date(usage.stt.syncedAt).toLocaleString("zh-CN")}。</>}
              {usage.stt?.error && <span className="text-destructive"> Soniox 用量读取失败：{usage.stt.error}</span>}
            </p>
          </div>
        )}

        {/* Saved meetings: overview only — titles, text and audio stay private */}
        {savedMeetings && (
          <div className="space-y-3" data-admin-saved-meetings>
            <div>
              <h2 className="text-sm font-semibold">已保存的会议</h2>
              <p className="text-xs text-muted-foreground">
                仅显示概况（发起人、时间、时长、大小），看不到标题、文字和录音；会议 1 年后自动删除。
              </p>
            </div>
            {savedMeetings.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">发起人</th>
                      <th className="px-2 py-1.5 font-medium">时间</th>
                      <th className="px-2 py-1.5 font-medium">时长</th>
                      <th className="px-2 py-1.5 font-medium">句数</th>
                      <th className="px-2 py-1.5 font-medium">录音</th>
                      <th className="px-2 py-1.5 font-medium">分享</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {savedMeetings.map((m, i) => (
                      <tr key={i}>
                        <td className="max-w-40 truncate px-2 py-1.5">{m.ownerEmail}</td>
                        <td className="whitespace-nowrap px-2 py-1.5">{new Date(m.createdAt).toLocaleString("zh-CN")}</td>
                        <td className="px-2 py-1.5 tabular-nums">{Math.round(m.durationMs / 60000)} 分</td>
                        <td className="px-2 py-1.5 tabular-nums">{m.entryCount}</td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {m.recordingBytes > 0 ? `${(m.recordingBytes / 1024 / 1024).toFixed(1)} MB` : "—"}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">{m.sharedWith || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Feedback: what users sent from the app, newest first */}
        {feedback && (
          <div className="space-y-3" data-admin-feedback>
            <div>
              <h2 className="text-sm font-semibold">意见反馈</h2>
              <p className="text-xs text-muted-foreground">最近 200 条，附带设备信息（界面语言、浏览器、屏幕、是否 App、页面）。</p>
            </div>
            {feedback.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {feedback.map((f) => (
                  <li key={f.id} className="space-y-1.5 px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                      <span className="whitespace-nowrap">{new Date(f.createdAt).toLocaleString("zh-CN")}</span>
                      <span className="max-w-60 truncate">{f.email}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                        {FEEDBACK_TOPIC_LABEL[f.topic] ?? f.topic}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm">{f.message}</p>
                    {f.context && Object.keys(f.context).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(f.context).map(([k, v]) => (
                          <span
                            key={k}
                            title={contextValue(v)}
                            className="max-w-full truncate rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground sm:max-w-80"
                          >
                            {k}: {contextValue(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
