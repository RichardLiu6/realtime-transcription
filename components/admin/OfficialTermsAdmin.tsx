"use client";

// Admin: the anonymous history of AI term suggestions, and the official
// term packs made from it (shown to everyone beside the built-in presets)
// — reuse what was already paid for. A suggestion's terms (all, or the
// ticked ones) go into a new pack or are added to an existing one. The
// history also exports as JSON (to merge elsewhere). Two page sections.

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AdminSection, { AdminEmpty } from "@/components/admin/AdminSection";

interface Pack {
  id: string;
  name: string;
  languages: string[];
  terms: string[];
  enabled: boolean;
  updatedAt: string;
}

interface Suggestion {
  id: string;
  createdAt: string;
  title: string;
  description: string;
  languages: string[];
  terms: string[];
}

const NEW = "__new";
const langs = (codes: string[]) => codes.map((c) => c.toUpperCase()).join("/");

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  const data = r ? await r.json().catch(() => ({})) : {};
  return { ok: !!r?.ok, data };
}

export default function OfficialTermsAdmin({ onMessage }: { onMessage: (text: string, error?: boolean) => void }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [q, setQ] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  // Pack whose terms are being edited
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  // Per suggestion: unticked terms, and where to publish
  const [unticked, setUnticked] = useState<Record<string, Set<string>>>({});
  const [target, setTarget] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const loadPacks = useCallback(async () => {
    const { ok, data } = await call("/api/admin/official-packs", "GET");
    setAvailable(ok && data.available !== false);
    if (ok) setPacks((data.packs as Pack[]) ?? []);
  }, []);

  const loadSuggestions = useCallback(async (query: string) => {
    setLoadingList(true);
    const { ok, data } = await call(`/api/admin/term-suggestions?q=${encodeURIComponent(query)}`, "GET");
    if (ok) setSuggestions((data.suggestions as Suggestion[]) ?? []);
    setLoadingList(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    loadPacks();
    loadSuggestions("");
  }, [loadPacks, loadSuggestions]);

  const patchPack = async (id: string, body: Record<string, unknown>, done: string) => {
    const { ok, data } = await call(`/api/admin/official-packs/${id}`, "PATCH", body);
    if (!ok) return onMessage(String(data.error ?? "更新失败"), true), false;
    onMessage(done);
    await loadPacks();
    return true;
  };

  const publish = async (s: Suggestion) => {
    const terms = s.terms.filter((t) => !unticked[s.id]?.has(t));
    if (terms.length === 0) return onMessage("没有选中的术语", true);
    const to = target[s.id] ?? NEW;
    setBusy(s.id);
    if (to === NEW) {
      const name = window.prompt("官方术语包名称", s.title || "新术语包")?.trim();
      if (name) {
        const { ok, data } = await call("/api/admin/official-packs", "POST", { name, terms, languages: s.languages });
        onMessage(ok ? `已发布官方术语包「${name}」` : String(data.error ?? "创建失败"), !ok);
        if (ok) await loadPacks();
      }
    } else {
      const pack = packs.find((p) => p.id === to);
      await patchPack(to, { addTerms: terms, languages: s.languages }, `已把 ${terms.length} 个术语加入「${pack?.name}」（重复的自动跳过）`);
    }
    setBusy(null);
  };

  if (available === false) return null;

  return (
    <>
      <AdminSection
        title="AI 术语生成记录"
        count={suggestions.length}
        info="匿名（不记录是谁生成的），最近 200 条。整条或勾选部分术语，发布为新的官方包或加入已有的包。"
        data-admin-term-suggestions
        actions={
          <>
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                loadSuggestions(q.trim());
              }}
            >
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索" className="h-7 w-32 text-xs" />
              <Button size="icon-sm" variant="ghost" type="submit" aria-label="搜索">
                {loadingList ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
              </Button>
            </form>
            <a
              href="/api/admin/term-suggestions?download=1"
              title="导出全部 JSON"
              aria-label="导出全部 JSON"
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Download className="size-3.5" />
            </a>
          </>
        }
      >
        {suggestions.length === 0 ? (
          <AdminEmpty>{loadingList ? "加载中…" : "暂无"}</AdminEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {suggestions.map((s) => {
              const off = unticked[s.id] ?? new Set<string>();
              return (
                <li key={s.id} className="space-y-1 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
                    <span className="font-medium text-foreground">{s.title || "（无标题）"}</span>
                    <span>{langs(s.languages)}</span>
                    <span className="ml-auto whitespace-nowrap">{new Date(s.createdAt).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>
                  <p className="line-clamp-2 text-muted-foreground" title={s.description}>
                    {s.description}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {s.terms.map((term) => (
                      <label
                        key={term}
                        className={`inline-flex cursor-pointer items-center gap-1 rounded border px-1 py-px text-[11px] ${
                          off.has(term) ? "border-border text-muted-foreground line-through" : "border-foreground/25"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={!off.has(term)}
                          onChange={() => {
                            const next = new Set(off);
                            if (next.has(term)) next.delete(term);
                            else next.add(term);
                            setUnticked({ ...unticked, [s.id]: next });
                          }}
                          className="size-3 accent-foreground"
                        />
                        {term.split("=").join(" = ")}
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={target[s.id] ?? NEW}
                      onChange={(e) => setTarget({ ...target, [s.id]: e.target.value })}
                      className="h-6 min-w-0 rounded border border-input bg-background px-1 text-[11px]"
                    >
                      <option value={NEW}>新的官方包…</option>
                      {packs.map((p) => (
                        <option key={p.id} value={p.id}>
                          加入「{p.name}」
                        </option>
                      ))}
                    </select>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={busy === s.id} onClick={() => publish(s)}>
                      {busy === s.id && <Loader2 className="size-3 animate-spin" />}
                      发布 {s.terms.length - off.size} 个
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AdminSection>

      <AdminSection
        title="官方术语包"
        count={packs.length}
        info="从左侧生成记录发布而来。启用的包对所有人可见（含访客），排在内置行业包前面；选用不消耗 AI 额度。"
        data-admin-official-packs
      >
        {packs.length === 0 ? (
          <AdminEmpty>暂无，从 AI 术语生成记录里发布</AdminEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {packs.map((p) => (
              <li key={p.id} className="space-y-1.5 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`text-sm font-medium ${p.enabled ? "" : "text-muted-foreground"}`}>{p.name}</span>
                  <span className="text-muted-foreground">
                    {p.terms.length} 个{p.languages.length > 0 && ` · ${langs(p.languages)}`}
                  </span>
                  <span className="ml-auto flex items-center gap-2.5 text-muted-foreground">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={(e) =>
                          patchPack(p.id, { enabled: e.target.checked }, `已${e.target.checked ? "启用" : "停用"}「${p.name}」`)
                        }
                        className="size-3.5 accent-foreground"
                      />
                      启用
                    </label>
                    <button
                      type="button"
                      className="hover:text-foreground"
                      onClick={() => {
                        const name = window.prompt("新名称", p.name)?.trim();
                        if (name && name !== p.name) patchPack(p.id, { name }, `已改名为「${name}」`);
                      }}
                    >
                      改名
                    </button>
                    <button
                      type="button"
                      className="hover:text-foreground"
                      onClick={() => {
                        setEditing(editing === p.id ? null : p.id);
                        setEditText(p.terms.join("\n"));
                      }}
                    >
                      {editing === p.id ? "收起" : "编辑"}
                    </button>
                    <button
                      type="button"
                      aria-label={`删除 ${p.name}`}
                      className="hover:text-destructive"
                      onClick={async () => {
                        if (!window.confirm(`删除官方术语包「${p.name}」？`)) return;
                        const { ok } = await call(`/api/admin/official-packs/${p.id}`, "DELETE");
                        onMessage(ok ? `已删除「${p.name}」` : "删除失败", !ok);
                        loadPacks();
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </div>
                {editing === p.id ? (
                  <div className="space-y-1.5">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={8}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs"
                    />
                    <Button
                      size="sm"
                      className="h-7"
                      onClick={async () => {
                        if (await patchPack(p.id, { terms: editText }, `已保存「${p.name}」的术语`)) setEditing(null);
                      }}
                    >
                      保存
                    </Button>
                  </div>
                ) : (
                  <p className="line-clamp-2 text-muted-foreground" title={p.terms.join("\n")}>
                    {p.terms.map((t) => t.split("=").join(" = ")).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </>
  );
}
