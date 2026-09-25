// Client-side port of Confucius4-T3PO's TranslationEngine
// (inference/translation.py). One engine per direction keeps the committed
// history across sentences; the model call itself goes through /api/simul.
//
// Differences from upstream, all about running in a browser:
// - operations are serialized per engine, and feeds that arrive while a model
//   call is in flight are merged into the next step (upstream is called
//   synchronously by its own server)
// - each buffer belongs to one transcript entry; flush() closes that entry
// - flush() reports leftover source when the backend can't force output
//   (e.g. it ignores `min_tokens`), so the caller can translate it another way

import {
  type Direction,
  type TermPair,
  isLatinToken,
  joinSource,
  sanitize,
  sourceUnits,
  splitSource,
} from "./protocol";

export type StepFn = (req: {
  direction: Direction;
  history: TermPair[];
  current: string;
  force: boolean;
}) => Promise<{ action: "WAIT" | "TRANS"; text: string }>;

export interface EngineCallbacks {
  // A committed translation segment for an entry (append-only)
  onCommit: (entryId: string, segment: string) => void;
  // flush() finished; leftover = source that could not be translated
  onFlushed: (entryId: string, leftover: string) => void;
  onError: (error: unknown) => void;
}

// Upstream defaults (inference/config.py)
const FORCE_BREAK_THRESHOLD = 20;
const MAX_BUFFER_UNITS = 200;
const HISTORY_WINDOW = 30;

type Op = { kind: "feed"; entryId: string; text: string } | { kind: "flush"; entryId: string };

export class SimulEngine {
  private history: TermPair[] = [];
  private buffer: string[] = [];
  private entryId: string | null = null;
  private queue: Op[] = [];
  private running = false;
  private closed = false;

  constructor(
    readonly direction: Direction,
    private readonly step: StepFn,
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

  // Stop processing; pending work is dropped
  close() {
    this.closed = true;
    this.queue = [];
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0 && !this.closed) {
        const op = this.queue.shift()!;
        // Merge consecutive feeds for the same entry into one model step
        if (op.kind === "feed") {
          while (this.queue[0]?.kind === "feed" && this.queue[0].entryId === op.entryId) {
            op.text += (this.queue.shift() as { text: string }).text;
          }
        }
        try {
          if (op.kind === "feed") await this.doFeed(op.entryId, op.text);
          else await this.doFlush(op.entryId);
        } catch (error) {
          this.cb.onError(error);
          if (op.kind === "flush") {
            // Hand the untranslated tail back rather than lose it
            const leftover = joinSource(this.buffer, this.direction);
            this.buffer = [];
            this.entryId = null;
            this.cb.onFlushed(op.entryId, leftover);
          }
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async doFeed(entryId: string, text: string) {
    // A new entry while the previous one still has source: close it first
    if (this.entryId && this.entryId !== entryId && this.buffer.length > 0) {
      await this.doFlush(this.entryId);
    }
    this.entryId = entryId;

    const incoming = splitSource(text, this.direction).filter((t) => t.length > 0);
    if (incoming.length === 0) return;
    // A Latin word split across ASR updates ("priorit" + "ize") is one unit
    if (
      this.direction === "zh2en" &&
      isLatinToken(this.buffer[this.buffer.length - 1]) &&
      isLatinToken(incoming[0])
    ) {
      this.buffer[this.buffer.length - 1] += incoming.shift();
    }
    this.buffer.push(...incoming);

    const units = sourceUnits(this.buffer, this.direction);
    if (units === 0) return;
    if (units >= MAX_BUFFER_UNITS) return void (await this.translateCurrent(true));
    // A trailing English word may still be mid-utterance: wait for the next update
    if (this.direction === "zh2en" && isLatinToken(this.buffer[this.buffer.length - 1])) return;
    await this.translateCurrent(units >= FORCE_BREAK_THRESHOLD);
  }

  private async doFlush(entryId: string) {
    let leftover = "";
    if (this.entryId === entryId && this.buffer.length > 0) {
      const committed = await this.translateCurrent(true);
      if (!committed) leftover = joinSource(this.buffer, this.direction);
      this.buffer = [];
    }
    if (this.entryId === entryId) this.entryId = null;
    this.cb.onFlushed(entryId, leftover);
  }

  // One model step on the current buffer; true if a segment was committed
  private async translateCurrent(force: boolean): Promise<boolean> {
    const source = joinSource(this.buffer, this.direction);
    if (!source.trim() || !this.entryId) return false;
    const entryId = this.entryId;
    const { action, text } = await this.step({
      direction: this.direction,
      history: this.history.slice(-HISTORY_WINDOW),
      current: source,
      force,
    });
    if (action !== "TRANS" || !text) return false;

    this.history.push([sanitize(source), sanitize(text)]);
    if (this.history.length > HISTORY_WINDOW) this.history = this.history.slice(-HISTORY_WINDOW);
    this.buffer = [];
    this.cb.onCommit(entryId, text);
    return true;
  }
}
