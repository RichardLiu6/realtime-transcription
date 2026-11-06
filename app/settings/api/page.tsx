"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Check, Copy, KeyRound, Trash2 } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLocale, useT } from "@/lib/i18n";
import type { ApiTokenInfo } from "@/lib/apiTokens";
import { agentGuide } from "@/lib/agentGuide";

// Personal API tokens: create (the value is shown once), list, revoke, and
// how to read meetings with one (curl / the CLI, public/abl.mjs served at /abl.mjs). Opened from the
// user menu (desktop) and the settings (phone).
export default function ApiTokensPage() {
  const t = useT();
  const locale = useLocale();
  const [state, setState] = useState<{ available: boolean; tokens: ApiTokenInfo[] } | null>(null);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [guideCopied, setGuideCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/tokens", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setState({ available: !!d.available, tokens: d.tokens ?? [] }))
      .catch(() => setState({ available: false, tokens: [] }));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    document.title = t("api_tokens");
  }, [t]);

  const create = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    setBusy(false);
    if (r?.status === 409) return setError(t("api_limit"));
    if (!r?.ok) return setError(t("api_failed"));
    const d = (await r.json()) as { token: string };
    setCreated(d.token);
    setCopied(false);
    setGuideCopied(false);
    setName("");
    load();
  };

  const revoke = async (id: string) => {
    if (!window.confirm(t("api_revoke_confirm"))) return;
    const r = await fetch(`/api/tokens/${id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) return setError(t("api_failed"));
    load();
  };

  const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const example = created ?? "abl_…";
  const guide = agentGuide(origin, created);

  return (
    <div className="min-h-dvh bg-background">
      <header className="safe-top safe-x sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-700 hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />
            {t("back_to_app")}
          </Link>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <KeyRound className="size-5" aria-hidden />
          {t("api_tokens")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">{t("api_intro")}</p>

        {state === null ? (
          <p className="mt-6 text-sm text-gray-600">{t("loading")}</p>
        ) : !state.available ? (
          <p className="mt-6 text-sm text-gray-700">{t("api_unavailable")}</p>
        ) : (
          <>
            <form
              className="mt-5 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-gray-700">
                {t("api_name")}
                <input
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("api_name_placeholder")}
                  data-token-name
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus:border-ring"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                data-token-create
                className="h-9 rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
              >
                {t("api_create")}
              </button>
            </form>
            {error && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {error}
              </p>
            )}

            {created && (
              <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3" data-token-created>
                <p className="text-sm font-medium text-amber-900">{t("api_created_once")}</p>
                <div className="mt-2 flex items-center gap-2">
                  <code data-token-value className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1.5 font-mono text-xs text-foreground">
                    {created}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(created).then(() => setCopied(true));
                    }}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border bg-white px-2 text-xs hover:bg-muted"
                  >
                    {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                    {copied ? t("api_copied") : t("api_copy")}
                  </button>
                </div>
              </div>
            )}

            {state.tokens.length === 0 ? (
              <p className="mt-6 text-sm text-gray-600" data-tokens-empty>
                {t("api_none")}
              </p>
            ) : (
              <ul className="mt-6 divide-y divide-border rounded-md border border-border" data-tokens-list>
                {state.tokens.map((tok) => (
                  <li key={tok.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{tok.name}</p>
                      <p className="text-xs text-gray-600">
                        {t("api_meta", {
                          created: date(tok.createdAt),
                          expires: date(tok.expiresAt),
                          used: tok.lastUsedAt ? date(tok.lastUsedAt) : t("api_never"),
                        })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void revoke(tok.id)}
                      data-token-revoke
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-red-200 px-2 text-xs text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      {t("api_revoke")}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <section className="mt-8 rounded-md border border-border p-4" data-agent-guide>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Bot className="size-4" aria-hidden />
                {t("api_agent")}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-700">{t("api_agent_intro")}</p>
              <button
                type="button"
                data-agent-copy
                onClick={() => {
                  void navigator.clipboard?.writeText(guide).then(() => setGuideCopied(true));
                }}
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/90"
              >
                {guideCopied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {guideCopied ? t("api_copied") : t("api_agent_copy")}
              </button>
              <p className={`mt-2 text-xs leading-snug ${created ? "text-amber-800" : "text-gray-600"}`}>
                {t(created ? "api_agent_with_token" : "api_agent_no_token")}
              </p>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-gray-700 hover:text-foreground">{t("api_agent_preview")}</summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
                  {guide}
                </pre>
              </details>
              <p className="mt-3 text-xs text-gray-600">
                {t("api_agent_url")} <code className="break-all font-mono">{origin}/llms.txt</code>
              </p>
            </section>

            <h2 className="mt-8 text-base font-semibold">{t("api_usage")}</h2>
            <p className="mt-2 text-sm text-gray-700">{t("api_usage_curl")}</p>
            <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
              {`curl -H "Authorization: Bearer ${example}" ${origin}/api/v1/meetings
curl -H "Authorization: Bearer ${example}" "${origin}/api/v1/meetings/<id>?format=md"`}
            </pre>
            <p className="mt-3 text-sm text-gray-700">{t("api_usage_cli")}</p>
            <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
              {`curl -O ${origin}/abl.mjs
export ABL_TOKEN=${example}
export ABL_URL=${origin}
node abl.mjs meetings list
node abl.mjs meetings get <id> --format md > meeting.md
node abl.mjs meetings export --format md --dir meetings`}
            </pre>
          </>
        )}
      </main>
    </div>
  );
}
