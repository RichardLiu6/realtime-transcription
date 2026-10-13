"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
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
  Users,
  Ticket,
  BarChart3,
  Sparkles,
  FolderClock,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { MODEL_POOL } from "@/lib/models";
import OfficialTermsAdmin from "@/components/admin/OfficialTermsAdmin";
import AdminSection, { AdminEmpty } from "@/components/admin/AdminSection";

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
  aiTerms?: boolean;
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

// The admin page's sections, one on screen at a time
const SECTIONS = [
  { key: "users", label: "用户", icon: Users },
  { key: "codes", label: "临时会议码", icon: Ticket },
  { key: "usage", label: "用量与费用", icon: BarChart3 },
  { key: "terms", label: "AI 术语", icon: Sparkles },
  { key: "saved", label: "已保存的会议", icon: FolderClock },
  { key: "feedback", label: "意见反馈", icon: MessageSquare },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

function readSection(): SectionKey {
  const hash = window.location.hash.slice(1);
  return SECTIONS.some((s) => s.key === hash) ? (hash as SectionKey) : "users";
}

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
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
        body: JSON.stringify({ email: userEmail, model: model || null }),
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

  const handleAiTermsChange = async (userEmail: string, aiTerms: boolean) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, aiTerms }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "更新失败");
        return;
      }
      setSuccess(`已${aiTerms ? "开通" : "关闭"} ${userEmail} 的 AI 生成术语`);
      fetchUsers();
    } catch {
      setError("网络错误");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && email.trim() && !loading) handleAdd();
  };

  // The message toast fades after a few seconds
  useEffect(() => {
    if (!error && !success) return;
    const id = setTimeout(() => {
      setError("");
      setSuccess("");
    }, 5000);
    return () => clearTimeout(id);
  }, [error, success]);

  // The section on screen, as the URL hash (#usage …): reload / back keep it
  const section = useSyncExternalStore(subscribeHash, readSection, () => "users" as SectionKey);
  const selectSection = (key: SectionKey) => {
    window.location.hash = key;
  };
  const sectionCount = (key: SectionKey): number | undefined =>
    key === "users"
      ? users.length
      : key === "codes"
        ? meetings.filter((m) => m.active).length
        : key === "saved"
          ? savedMeetings?.length
          : key === "feedback"
            ? feedback?.length
            : undefined;

  const th = "sticky top-0 z-[1] bg-muted px-2 py-1.5 font-medium";

  return (
    <div className="flex h-dvh flex-col bg-muted/30 md:flex-row">
      {/* Messages: a toast, so they never push the sections around */}
      {(error || success) && (
        <p
          role="status"
          className={`fixed left-1/2 top-4 z-50 max-w-[90vw] -translate-x-1/2 rounded-md border bg-background px-4 py-2 text-sm shadow-lg ${
            error ? "border-destructive text-destructive" : "border-border text-green-700"
          }`}
        >
          {error || success}
        </p>
      )}

      {/* Section list: one section at a time (remembered in the URL hash);
          a row of tabs on phones */}
      <nav className="flex shrink-0 flex-col border-border bg-background max-md:border-b md:w-52 md:border-r">
        <div className="flex items-center justify-between gap-2 px-3 pt-2 md:flex-col md:items-stretch md:px-4 md:pt-4 md:pb-1">
          <h1 className="text-sm font-bold text-foreground md:text-base">管理后台</h1>
          <Button asChild variant="outline" size="sm" className="shrink-0 md:w-full md:justify-start">
            <Link href="/">
              <ArrowLeft aria-hidden />
              返回首页
            </Link>
          </Button>
        </div>
        <ul className="flex gap-1 overflow-x-auto px-2 py-2 md:flex-col md:overflow-visible md:py-1">
          {SECTIONS.map(({ key, label, icon: Icon }) => {
            const n = sectionCount(key);
            return (
              <li key={key} className="shrink-0">
                <button
                  type="button"
                  onClick={() => selectSection(key)}
                  aria-current={section === key ? "page" : undefined}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors ${
                    section === key ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                  {n !== undefined && <span className="ml-auto pl-2 text-xs tabular-nums text-muted-foreground">{n}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto flex gap-1 border-border px-2 py-2 max-md:hidden md:flex-col md:border-t">
          <Link href="/admin/compare" className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground">
            <GitCompareArrows className="size-4" />
            模型对比
          </Link>
        </div>
      </nav>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-3 md:p-4">
          {section === "users" && (
            <>
          {/* Users: add in the header, one line per user */}
          <AdminSection
            title="已授权用户"
            count={users.length}
            info="AI 术语：允许该用户用 AI 生成术语（默认关闭）。下拉框：该用户的翻译模型。"
            data-admin-users
            actions={
              <div className="flex items-center gap-1" onKeyDown={handleKeyDown}>
                <Input
                  type="email"
                  placeholder="邮箱"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-7 w-40 text-xs"
                  disabled={loading}
                />
                <Input
                  type="text"
                  placeholder="姓名"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-7 w-20 text-xs"
                  disabled={loading}
                />
                <Button size="icon-sm" onClick={handleAdd} disabled={!email.trim() || loading} aria-label="添加用户">
                  {loading ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
                </Button>
              </div>
            }
          >
            {users.length === 0 ? (
              <AdminEmpty>暂无用户，请添加</AdminEmpty>
            ) : (
              <ul className="divide-y divide-border">
                {users.map((user) => (
                  <li key={user.email} className="flex items-center gap-2 px-3 py-1.5">
                    <p className="min-w-0 flex-1 truncate text-sm" title={user.email}>
                      <span className="font-medium text-foreground">{user.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{user.email}</span>
                    </p>
                    <label
                      className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                      title="允许该用户用 AI 生成术语（默认关闭）"
                    >
                      <input
                        type="checkbox"
                        checked={user.aiTerms === true}
                        onChange={(e) => handleAiTermsChange(user.email, e.target.checked)}
                        className="size-3.5 accent-foreground"
                        data-admin-ai-terms
                      />
                      AI 术语
                    </label>
                    <select
                      value={user.model || ""}
                      onChange={(e) => handleModelChange(user.email, e.target.value)}
                      className="h-7 w-32 shrink-0 rounded border border-input bg-background px-1 text-xs text-muted-foreground"
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
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`删除 ${user.email}`}
                    >
                      {deleting === user.email ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>
            </>
          )}
          {section === "codes" && (
            <>
          {/* Meeting codes: generate in the header */}
          <AdminSection
            title="临时会议码"
            count={meetings.filter((m) => m.active).length}
            info="访客用会议码登录，到期失效；访客不能保存会议，也不能用 AI 生成术语。"
            data-admin-meeting-codes
            actions={
              <div className="flex items-center gap-1">
                <select
                  value={meetingHours}
                  onChange={(e) => setMeetingHours(e.target.value)}
                  className="h-7 rounded border border-input bg-background px-1 text-xs"
                  disabled={creatingMeeting}
                  aria-label="有效期"
                >
                  {["1", "2", "4", "8", "12", "24"].map((h) => (
                    <option key={h} value={h}>
                      {h} 小时
                    </option>
                  ))}
                </select>
                <Button size="sm" className="h-7 text-xs" onClick={handleCreateMeeting} disabled={creatingMeeting}>
                  {creatingMeeting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  生成
                </Button>
              </div>
            }
          >
            {meetings.length === 0 ? (
              <AdminEmpty>暂无会议码</AdminEmpty>
            ) : (
              <ul className="divide-y divide-border">
                {meetings.map((m) => (
                  <li key={m.code} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="font-mono text-sm font-bold tracking-widest">{m.code}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                        m.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {m.active ? "有效" : "已过期"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      到期 {new Date(m.expiresAt).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" })}
                    </span>
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
                          {deactivating === m.code ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>
            </>
          )}
          {section === "usage" && (
            <>
          {/* Usage and cost: translation cost as reported by OpenRouter,
              transcription as billed by Soniox (its usage logs), or estimated
              from its list price for months before per-user attribution */}
          {usage && (
            <AdminSection
              title="用量与费用"
             
              data-admin-usage
              info={`翻译费用为 OpenRouter 返回的实际金额（含说话中的临时翻译和会议纪要）；${
                usage.stt?.source === "soniox"
                  ? "转录时长和费用为 Soniox 用量记录中的实际值。"
                  : `转录按 Soniox $${usage.sonioxUsdPerHour}/小时估算（这个月份还没有按用户的 Soniox 记录）。`
              }按 UTC 月份统计，2026 年 9 月起。鼠标停在用户上可以看到按模型的明细。`}
              actions={
                <select
                  value={usage.month}
                  onChange={(e) => setUsageMonth(e.target.value)}
                  aria-label="月份"
                  className="h-7 rounded border border-input bg-background px-1.5 text-xs"
                >
                  {usage.months.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              }
              footer={
                <span data-usage-stt-note>
                  {usage.users.some((u) => u.email === "") && <>“未标记转录”是没有带用户的 Soniox 请求：按用户统计开始之前的，或在 Soniox 控制台里用的。</>}
                  {usage.stt?.source === "estimate" && usage.stt.sonioxTotalUsd !== null && usage.stt.sonioxTotalUsd > 0 && (
                    <> Soniox 本月实际账单 {usd(usage.stt.sonioxTotalUsd)}（未按用户区分）。</>
                  )}
                  {usage.stt?.syncedAt && <> Soniox 数据更新于 {new Date(usage.stt.syncedAt).toLocaleString("zh-CN")}。</>}
                  {usage.stt?.error && <span className="text-destructive"> Soniox 用量读取失败：{usage.stt.error}</span>}
                </span>
              }
            >
              {usage.users.length === 0 ? (
                <AdminEmpty>本月暂无用量</AdminEmpty>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className={th}>用户</th>
                      <th className={`${th} text-right`}>转录</th>
                      <th className={`${th} text-right`} title="整句 / 临时 / 纪要">翻译调用</th>
                      <th className={`${th} text-right`} title="输入 / 输出">Tokens</th>
                      <th className={`${th} text-right`}>翻译</th>
                      <th className={`${th} text-right`}>{usage.stt?.source === "soniox" ? "转录" : "转录≈"}</th>
                      <th className={`${th} text-right`}>合计</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {usage.users.map((u) => (
                      <tr key={u.email} data-usage-user={u.email}>
                        <td
                          className="max-w-48 truncate px-2 py-1.5"
                          title={u.models
                            .map((m) => `${m.model}: ${m.calls} 次, ${formatTokens(m.inputTokens)}↑ ${formatTokens(m.outputTokens)}↓, ${usd(m.costUsd)}`)
                            .join("\n")}
                        >
                          {u.email === "guest" ? "访客（会议码）" : u.email === "" ? "未标记转录" : u.email}
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
                  <tfoot className="sticky bottom-0 bg-muted font-medium">
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
              )}
            </AdminSection>
          )}
            </>
          )}
          {section === "terms" && (
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          {/* Official term packs and the anonymous AI suggestions they come from */}
          <OfficialTermsAdmin
            onMessage={(text, isError) => {
              if (isError) {
                setSuccess("");
                setError(text);
              } else {
                setError("");
                setSuccess(text);
              }
            }}
          />
            </div>
          )}
          {section === "saved" && (
            <>
          {/* Saved meetings: overview only — titles, text and audio stay private */}
          {savedMeetings && (
            <AdminSection
              title="已保存的会议"
              count={savedMeetings.length}
              info="仅显示概况（发起人、时间、时长、大小），看不到标题、文字和录音；会议 1 年后自动删除。"
              data-admin-saved-meetings
            >
              {savedMeetings.length === 0 ? (
                <AdminEmpty>暂无</AdminEmpty>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className={th}>发起人</th>
                      <th className={th}>时间</th>
                      <th className={th}>时长</th>
                      <th className={th}>句数</th>
                      <th className={th}>录音</th>
                      <th className={th}>分享</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {savedMeetings.map((m, i) => (
                      <tr key={i}>
                        <td className="max-w-40 truncate px-2 py-1.5" title={m.ownerEmail}>{m.ownerEmail}</td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          {new Date(m.createdAt).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">{Math.round(m.durationMs / 60000)} 分</td>
                        <td className="px-2 py-1.5 tabular-nums">{m.entryCount}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                          {m.recordingBytes > 0 ? `${(m.recordingBytes / 1024 / 1024).toFixed(1)} MB` : "—"}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">{m.sharedWith || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </AdminSection>
          )}
            </>
          )}
          {section === "feedback" && (
            <>
          {/* Feedback: what users sent from the app, newest first */}
          {feedback && (
            <AdminSection
              title="意见反馈"
              count={feedback.length}
              info="最近 200 条，附带设备信息（界面语言、浏览器、屏幕、是否 App、页面）。"
              data-admin-feedback
            >
              {feedback.length === 0 ? (
                <AdminEmpty>暂无</AdminEmpty>
              ) : (
                <ul className="divide-y divide-border">
                  {feedback.map((f) => (
                    <li key={f.id} className="space-y-1 px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                          {FEEDBACK_TOPIC_LABEL[f.topic] ?? f.topic}
                        </span>
                        <span className="max-w-60 truncate">{f.email}</span>
                        <span className="ml-auto whitespace-nowrap">
                          {new Date(f.createdAt).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm">{f.message}</p>
                      {f.context && Object.keys(f.context).length > 0 && (
                        <p
                          className="truncate text-[11px] text-muted-foreground"
                          title={Object.entries(f.context).map(([k, v]) => `${k}: ${contextValue(v)}`).join("\n")}
                        >
                          {Object.entries(f.context).map(([k, v]) => `${k}: ${contextValue(v)}`).join(" · ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </AdminSection>
          )}
            </>
          )}
      </main>
    </div>
  );
}
