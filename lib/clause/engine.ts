// Clause-level streaming translation for any translation API.
//
// Committed ASR text is split at clause punctuation (，。！？；： … and ASCII
// ,.!?;: followed by a space); each clause is translated as soon as it is
// complete, as a continuation of the sentence so far, and appended — never
// rewritten. A clause too short to translate well ("嗯，", "OK,") is merged
// into the next one; a long stretch without punctuation is forced out.
//
// Same shape as the T3PO SimulEngine (feed / flush / close + callbacks), so
// the transcription hook treats both alike and either accepts text from any
// streaming ASR.

import type { EngineCallbacks } from "@/lib/t3po/engine";

export interface ClauseRequest {
  entryId: string;
  clause: string;
  sourceSoFar: string; // earlier clauses of this sentence
  translationSoFar: string; // their committed translation
  sourceLang: string;
  targetLang: string;
}

export type ClauseTranslateFn = (req: ClauseRequest) => Promise<string>;

const CJK = /[぀-ヿ㐀-鿿가-힯]/g;
// Clause end: CJK punctuation anywhere; ASCII punctuation only once a space
// follows (so "3.5" or a mid-token period doesn't split)
const BOUNDARY = /[，。！？；：…]|[,.!?;:](?=\s)/g;

// Minimum to translate on its own, and when to force without punctuation
// (upstream T3PO forces at 20 units)
const MIN_CJK = 4;
const MIN_WORDS = 3;
const FORCE_UNITS = 20;

function units(text: string): number {
  const cjk = (text.match(CJK) ?? []).length;
  const words = text.replace(CJK, " ").split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  return cjk + words;
}

function longEnough(text: string): boolean {
  const cjk = (text.match(CJK) ?? []).length;
  if (cjk > 0) return cjk >= MIN_CJK;
  return text.trim().split(/\s+/).filter(Boolean).length >= MIN_WORDS;
}

// Take the next translatable clause off the front of the buffer, if any
export function nextClause(buffer: string): { clause: string; rest: string } | null {
  BOUNDARY.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BOUNDARY.exec(buffer))) {
    const end = m.index + m[0].length;
    const clause = buffer.slice(0, end);
    if (longEnough(clause)) return { clause, rest: buffer.slice(end) };
  }
  if (units(buffer) >= FORCE_UNITS) return { clause: buffer, rest: "" };
  return null;
}

type Op = { kind: "feed"; entryId: string; text: string } | { kind: "flush"; entryId: string };

interface EntryState {
  buffer: string;
  source: string[];
  translation: string[];
}

export class ClauseEngine {
  private entries = new Map<string, EntryState>();
  private queue: Op[] = [];
  private running = false;
  private closed = false;

  constructor(
    private readonly translate: ClauseTranslateFn,
    // Source/target language of an entry (owned by the caller)
    private readonly langsFor: (entryId: string) => { sourceLang: string; targetLang: string } | null,
    // Join committed translation parts for display (spaces vs none)
    private readonly join: (parts: string[], targetLang: string) => string,
    private readonly cb: EngineCallbacks,
  ) {}

  feed(entryId: string, text: string) {
    if (!text || this.closed) return;
    const last = this.queue[this.queue.length - 1];
    if (last?.kind === "feed" && last.entryId === entryId) last.text += text;
    else this.queue.push({ kind: "feed", entryId, text });
    this.pump();
  }

  flush(entryId: string) {
    if (this.closed) return;
    this.queue.push({ kind: "flush", entryId });
    this.pump();
  }

  close() {
    this.closed = true;
    this.queue = [];
  }

  private state(entryId: string): EntryState {
    let st = this.entries.get(entryId);
    if (!st) {
      st = { buffer: "", source: [], translation: [] };
      this.entries.set(entryId, st);
    }
    return st;
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0 && !this.closed) {
        const op = this.queue.shift()!;
        const st = this.state(op.entryId);
        try {
          if (op.kind === "feed") {
            st.buffer += op.text;
            // Translate every complete clause now in the buffer
            let next: ReturnType<typeof nextClause>;
            while (!this.closed && (next = nextClause(st.buffer))) {
              await this.translateClause(op.entryId, st, next.clause);
              st.buffer = next.rest;
            }
          } else {
            if (st.buffer.trim()) await this.translateClause(op.entryId, st, st.buffer);
            this.entries.delete(op.entryId);
            this.cb.onFlushed(op.entryId, "");
          }
        } catch (error) {
          this.cb.onError(error);
          if (op.kind === "flush") {
            // Hand back what never got translated rather than lose it
            const leftover = st.buffer;
            this.entries.delete(op.entryId);
            this.cb.onFlushed(op.entryId, leftover || " ");
          }
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async translateClause(entryId: string, st: EntryState, clause: string) {
    const langs = this.langsFor(entryId);
    if (!langs) return;
    const text = await this.translate({
      entryId,
      clause: clause.trim(),
      sourceSoFar: st.source.join(""),
      translationSoFar: this.join(st.translation, langs.targetLang),
      ...langs,
    });
    st.source.push(clause);
    if (text.trim()) {
      st.translation.push(text.trim());
      this.cb.onCommit(entryId, text.trim());
    }
  }
}
