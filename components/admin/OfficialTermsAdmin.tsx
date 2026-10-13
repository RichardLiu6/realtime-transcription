"use client";

// Admin: official term packs (shown to everyone beside the built-in
// presets) and the anonymous history of AI term suggestions they are made
// from — reuse what was already paid for. A suggestion's terms (all, or the
// ticked ones) go into a new pack or are added to an existing one. The
// history exports as JSON, and a pack accepts pasted terms, so they can
// also be merged elsewhere (e.g. with an assistant) and pasted back.

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export default function OfficialTermsAdmin({ onMessage: report }: { onMessage: (text: string, error?: boolean) => void }) {
  // Shown here too: the page's own message line is far up
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const onMessage = (text: string, error = false) => {
    setNote({ text, error });
    report(text, error);
  };
  const [available, setAvailable] = useState<boolean | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [q, setQ] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  // New pack form
  const [newName, setNewName] = useState("");
  const [newTerms, setNewTerms] = useState("");
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

  const createPack = async (name: string, terms: string[] | string, languages: string[] = []) => {
    const { ok, data } = await call("/api/admin/official-packs", "POST", { name, terms, languages });
    if (!ok) return onMessage(String(data.error ?? "创建失败"), true), false;
    onMessage(`已发布官方术语包「${name}」`);
    await loadPacks();
    return true;
  };

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
      if (name) await createPack(name, terms, s.languages);
    } else {
      const pack = packs.find((p) => p.id === to);
      await patchPack(to, { addTerms: terms, languages: s.languages }, `已把 ${terms.length} 个术语加入「${pack?.name}」（重复的自动跳过）`);
    }
    setBusy(null);
  };

  if (available === false) return null;

  return (
    <div className="space-y-6" data-admin-official-terms>
      {note && (
        <p role="status" className={`sticky top-2 z-10 rounded-md border bg-background px-3 py-2 text-xs shadow-sm ${note.error ? "border-destructive text-destructive" : "border-border text-green-700"}`}>
          {note.text}
        </p>
      )}
      {/* Official packs */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">官方术语包</h2>
          <p className="text-xs text-muted-foreground">
            启用的包对所有人可见（含访客），和内置行业包并排；选用不消耗 AI 额度。
          </p>
        </div>
        {packs.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {packs.map((p) => (
              <li key={p.id} className="space-y-2 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="text-muted-foreground">
                    {p.terms.length} 个术语{p.languages.length > 0 && ` · ${langs(p.languages)}`}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <label className="flex items-center gap-1 text-muted-foreground">
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
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        const name = window.prompt("新名称", p.name)?.trim();
                        if (name && name !== p.name) patchPack(p.id, { name }, `已改名为「${name}」`);
                      }}
                    >
                      改名
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setEditing(editing === p.id ? null : p.id);
                        setEditText(p.terms.join("\n"));
                      }}
                    >
                      {editing === p.id ? "收起" : "编辑术语"}
                    </button>
                    <button
                      type="button"
                      aria-label={`删除 ${p.name}`}
                      className="text-muted-foreground hover:text-destructive"
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
                {editing === p.id && (
                  <div className="space-y-1.5">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={8}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs"
                    />
                    <Button
                      size="sm"
                      onClick={async () => {
                        if (await patchPack(p.id, { terms: editText }, `已保存「${p.name}」的术语`)) setEditing(null);
                      }}
                    >
                      保存
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-1.5 rounded-md border border-dashed border-border p-3">
          <p className="text-xs font-medium">新建官方包（粘贴术语：每行一个，或用逗号分隔；同一术语多语言写成 中文=English）</p>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="名称" className="h-8 text-sm" />
          <textarea
            value={newTerms}
            onChange={(e) => setNewTerms(e.target.value)}
            rows={4}
            placeholder={"胶囊填充机=Capsule Filler\n批生产记录=Batch Production Record"}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs"
          />
          <Button
            size="sm"
            disabled={!newName.trim() || !newTerms.trim()}
            onClick={async () => {
              if (await createPack(newName.trim(), newTerms)) {
                setNewName("");
                setNewTerms("");
              }
            }}
          >
            <Plus className="size-3.5" />
            发布
          </Button>
        </div>
      </div>

      {/* Anonymous AI suggestions */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">AI 术语生成记录</h2>
            <p className="text-xs text-muted-foreground">匿名（不记录是谁生成的），最近 200 条。可整条或勾选部分术语发布到官方包。</p>
          </div>
          <a
            href="/api/admin/term-suggestions?download=1"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            <Download className="size-3.5" />
            导出全部 JSON
          </a>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            loadSuggestions(q.trim());
          }}
        >
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索标题、描述或术语" className="h-8 text-sm" />
          <Button size="sm" variant="outline" type="submit">
            {loadingList ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
          </Button>
        </form>
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{loadingList ? "加载中…" : "暂无"}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {suggestions.map((s) => {
              const off = unticked[s.id] ?? new Set<string>();
              return (
                <li key={s.id} className="space-y-1.5 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                    <span className="whitespace-nowrap">{new Date(s.createdAt).toLocaleString("zh-CN")}</span>
                    {s.title && <span className="font-medium text-foreground">{s.title}</span>}
                    <span>{langs(s.languages)}</span>
                    <span>{s.terms.length} 个术语</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-muted-foreground">{s.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {s.terms.map((term) => (
                      <label
                        key={term}
                        className={`inline-flex cursor-pointer items-center gap-1 rounded border px-1.5 py-0.5 ${
                          off.has(term) ? "border-border text-muted-foreground line-through" : "border-foreground/30"
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
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <select
                      value={target[s.id] ?? NEW}
                      onChange={(e) => setTarget({ ...target, [s.id]: e.target.value })}
                      className="h-7 rounded border border-input bg-background px-1.5 text-xs"
                    >
                      <option value={NEW}>发布为新的官方包…</option>
                      {packs.map((p) => (
                        <option key={p.id} value={p.id}>
                          加入「{p.name}」
                        </option>
                      ))}
                    </select>
                    <Button size="sm" variant="outline" className="h-7" disabled={busy === s.id} onClick={() => publish(s)}>
                      {busy === s.id && <Loader2 className="size-3.5 animate-spin" />}
                      发布 {s.terms.length - off.size} 个
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
