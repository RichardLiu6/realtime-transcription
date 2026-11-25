"use client";

import { useState } from "react";
import { SpellCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/lib/i18n";
import { cleanTermPart, type TermFix } from "@/lib/termFixes";

// Sentences one after another: no space after a CJK full stop
const join = (a: string, b: string) => (!b ? a : /[。！？]$/.test(a) ? a + b : `${a} ${b}`);

export interface TermFixProps {
  fixes: TermFix[];
  recording: boolean;
  // How many sentences said so far an action would revise
  countTerm: (term: string) => number;
  countFix: (fix: TermFix) => number;
  // Each returns how many sentences were revised
  onAddTerm: (term: string, revise: boolean) => number;
  onAddFix: (fix: TermFix, revise: boolean) => number;
  onRemoveFix: (index: number) => void;
}

// 现场修正: a term spotted during the meeting — one to add (with how to
// translate it), or a word the engine keeps mishearing and what it should
// be. Translation follows at once; recognition from the next recording (the
// engine's context is fixed for a session).
export function TermFixPanel({ fixes, recording, countTerm, countFix, onAddTerm, onAddFix, onRemoveFix }: TermFixProps) {
  const t = useT();
  const [tab, setTab] = useState<"term" | "asr">("term");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [revise, setRevise] = useState(true);
  const [done, setDone] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  // 纠正错词: in the transcript (misheard) or in the translations (mistranslated)
  const [scope, setScope] = useState<"original" | "translation">("original");

  const first = cleanTermPart(a);
  const second = b.trim() ? cleanTermPart(b) : tab === "term" ? "" : null;
  const valid = !!first && second !== null && !(tab === "asr" && first === second);
  const term = tab === "term" && valid ? (second ? `${first}=${second}` : first!) : null;
  const fix: TermFix | null =
    tab === "asr" && valid ? { from: first!, to: second!, ...(scope === "translation" ? { scope } : {}) } : null;
  const affected = term ? countTerm(term) : fix ? countFix(fix) : 0;

  const submit = () => {
    if (!valid) {
      setInvalid(true);
      return;
    }
    const n = term ? onAddTerm(term, revise) : onAddFix(fix!, revise);
    // Recognition takes it from the next start of a recording
    const translationFix = tab === "asr" && scope === "translation";
    const base = translationFix
      ? t("fix_done_translation")
      : join(t(tab === "term" ? "fix_done_term" : "fix_done_asr"), recording ? t("fix_next_recording") : "");
    setDone(join(base, n > 0 ? t("fix_done_revised", { n }) : ""));
    setA("");
    setB("");
    setInvalid(false);
  };

  const input =
    "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring";
  const tabClass = (on: boolean) =>
    `flex-1 rounded px-2 py-1 text-xs font-medium ${on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`;
  return (
    <div data-term-fix className="text-sm">
      <p className="text-xs leading-snug text-gray-700">{t("fix_hint")}</p>
      <div className="mt-2 flex gap-1 rounded-md bg-muted p-0.5" role="tablist">
        {(["term", "asr"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            data-fix-tab={k}
            className={tabClass(tab === k)}
            onClick={() => {
              setTab(k);
              setDone(null);
              setInvalid(false);
            }}
          >
            {t(k === "term" ? "fix_tab_term" : "fix_tab_asr")}
          </button>
        ))}
      </div>
      <form
        className="mt-2 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {tab === "asr" && (
          <div className="flex items-center gap-1.5 text-xs" role="radiogroup" aria-label={t("fix_scope")}>
            <span className="font-medium text-gray-700">{t("fix_scope")}</span>
            {(["original", "translation"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={scope === k}
                data-fix-scope={k}
                onClick={() => {
                  setScope(k);
                  setDone(null);
                }}
                className={`rounded-full border px-2 py-0.5 ${
                  scope === k ? "border-primary bg-primary text-primary-foreground" : "border-border text-gray-700 hover:bg-muted"
                }`}
              >
                {t(k === "original" ? "fix_scope_original" : "fix_scope_translation")}
              </button>
            ))}
          </div>
        )}
        <label className="block text-xs font-medium text-gray-700">
          {t(tab === "term" ? "fix_term" : scope === "translation" ? "fix_translated" : "fix_heard")}
          <input
            data-fix-a
            value={a}
            maxLength={60}
            onChange={(e) => {
              setA(e.target.value);
              setDone(null);
            }}
            placeholder={t(tab === "term" ? "fix_term_ph" : scope === "translation" ? "fix_translated_ph" : "fix_heard_ph")}
            className={`mt-1 ${input}`}
          />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          {t(tab === "term" ? "fix_term_translation" : "fix_correct")}
          <input
            data-fix-b
            value={b}
            maxLength={60}
            onChange={(e) => {
              setB(e.target.value);
              setDone(null);
            }}
            placeholder={t(tab === "term" ? "fix_term_translation_ph" : scope === "translation" ? "fix_correct_translation_ph" : "fix_correct_ph")}
            className={`mt-1 ${input}`}
          />
        </label>
        {affected > 0 && (
          <label className="flex items-start gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              data-fix-revise
              checked={revise}
              onChange={(e) => setRevise(e.target.checked)}
              className="mt-0.5"
            />
            {t(tab === "term" ? "fix_revise_term" : scope === "translation" ? "fix_revise_translation" : "fix_revise_asr", { n: affected })}
          </label>
        )}
        {invalid && (
          <p role="alert" className="text-xs text-red-700">
            {t("fix_invalid")}
          </p>
        )}
        <Button type="submit" size="sm" data-fix-add disabled={!a.trim() || (tab === "asr" && !b.trim())}>
          {t("fix_add")}
        </Button>
        {done && (
          <p role="status" data-fix-done className="text-xs leading-snug text-green-800">
            {done}
          </p>
        )}
      </form>
      {fixes.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="text-xs font-medium text-gray-700">{t("fix_list")}</p>
          <ul className="mt-1 space-y-0.5" data-fix-list>
            {fixes.map((f, i) => (
              <li key={`${f.from}→${f.to}`} className="flex items-center gap-1 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  {f.scope === "translation" && (
                    <span className="mr-1 rounded bg-muted px-1 text-[10px] text-gray-700">{t("fix_scope_translation")}</span>
                  )}
                  <span className="text-gray-600 line-through">{f.from}</span> → <span className="font-medium">{f.to}</span>
                </span>
                <button
                  type="button"
                  aria-label={t("fix_remove")}
                  title={t("fix_remove")}
                  onClick={() => onRemoveFix(i)}
                  className="grid size-6 place-items-center rounded text-gray-500 hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Desktop: a status bar button with the panel in a popover
export default function TermFixButton(props: TermFixProps) {
  const t = useT();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-term-fix-button
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-gray-700 hover:bg-muted"
        >
          <SpellCheck className="size-4" aria-hidden />
          <span className="hidden xl:inline">{t("fix_button")}</span>
          <span className="sr-only xl:hidden">{t("fix_button")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <TermFixPanel {...props} />
      </PopoverContent>
    </Popover>
  );
}
