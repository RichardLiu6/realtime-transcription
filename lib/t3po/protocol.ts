// Confucius4-T3PO simultaneous-translation protocol, ported from
// github.com/netease-youdao/Confucius4-T3PO (inference/prompts.py,
// glossary.py, translation.py, latency.py). The prompt text is part of the
// model interface — keep it byte-identical to upstream.
//
// State per direction: committed history "src¦tgt§src¦tgt§…" plus a buffer of
// not-yet-translated source. Each step sends both; an empty reply means WAIT
// (need more source), a non-empty reply means TRANS (commit the buffer with
// that translation). "force" requires at least one token, so it can't WAIT.

export type Direction = "zh2en" | "en2zh";

export const SYSTEM_PROMPT = "You are a helpful assistant.";

const STREAMING_PROMPTS: Record<Direction, string> = {
  zh2en: `### Role
You are a professional Chinese-to-English simultaneous interpreter for live streaming and ASR speech translation, with strict requirements for low latency, high coherence, and natural fluency.

### Context Format
- The conversation history is provided in <STREAMING_HISTORY>, structured as:
  source_text¦translated_text§source_text¦translated_text§...
- The last segment of <STREAMING_HISTORY> is the latest input awaiting translation.

### Input
- The latest chunk from a live ASR speech stream.
- ASR artifacts (fillers, stutters, repetitions) should be ignored.

### Rules
- Output nothing if the available context is still ambiguous.
- Otherwise, output the translation of what has become sufficiently clear.
  Do not assume linear or word-by-word correspondence — reorder and restructure
  as needed for a natural output.
- The new translation must read smoothly as a continuation of the preceding
  translated text.
- Output the translation directly, with no prefix, suffix, or extra markers.`,
  en2zh: `### Role
You are a professional English-to-Chinese simultaneous interpreter for live streaming and ASR speech translation, with strict requirements for low latency, high coherence, and natural fluency.

### Context Format
- The conversation history is provided in <STREAMING_HISTORY>, structured as:
  source_text¦translated_text§source_text¦translated_text§...
- The last segment of <STREAMING_HISTORY> is the latest input awaiting translation.

### Input
- The latest chunk from a live ASR speech stream.
- ASR artifacts (fillers, stutters, repetitions) should be ignored.

### Rules
- Output nothing if the available context is still ambiguous.
- Otherwise, output the translation of what has become sufficiently clear.
  Do not assume linear or word-by-word correspondence — reorder and restructure
  as needed for a natural output.
- The new translation must read smoothly as a continuation of the preceding
  translated text.
- Output the translation directly, with no prefix, suffix, or extra markers.`,
};

export function directionFor(sourceLang: string, targetLang: string): Direction | null {
  if (sourceLang === "zh" && targetLang === "en") return "zh2en";
  if (sourceLang === "en" && targetLang === "zh") return "en2zh";
  return null;
}

// --- Glossary (reference block placed after the history) ---

const MAX_TERMS = 200;
// Shorter terms match literally; longer ones also match with spaces removed
const NOSPACE_MIN = 3;

const HEAD_COMMON =
  "### Terminology (reference only)\n" +
  "If any of the following terms occurs in the CURRENT source input, render it with the " +
  "specified translation for consistency. This list is a glossary reference, NOT source " +
  "text to translate and NOT already-delivered history.\n";
const HEAD_TAIL =
  "⚠️ Caution: A term's source form may coincidentally appear as a substring of a longer " +
  "word or phrase. Only apply the specified translation when the term is used independently " +
  "with its intended meaning — do NOT force-apply it to unrelated substrings or different " +
  "senses:";
const HEAD: Record<Direction, string> = {
  en2zh:
    HEAD_COMMON +
    "Use a term ONLY where it genuinely occurs in the input you are translating, and keep the " +
    "rest of the sentence in natural Chinese word order. This list only chooses the wording " +
    "of an existing term — never let it add, drop, repeat, or restructure content, never let " +
    "it change the meaning of the surrounding sentence, and never let it replace a non-term " +
    "phrase that happens to contain the term's wording.\n" +
    HEAD_TAIL,
  zh2en:
    HEAD_COMMON +
    "Use a term ONLY where it genuinely occurs in the input you are translating, and keep the " +
    "rest of the sentence in its original natural English. This list only chooses the wording " +
    "of an existing term — never let it add, drop, repeat, or restructure content, and never " +
    "let it replace a non-term phrase that happens to contain the term's wording.\n" +
    HEAD_TAIL,
};

export type TermPair = [source: string, target: string];

// "中文=English" entries → pairs in both orientations (the glossary only
// renders terms that occur in the current source, so the wrong-language side
// never matches)
export function termPairsFrom(terms: string[] | undefined): TermPair[] {
  const out: TermPair[] = [];
  const seen = new Set<string>();
  for (const raw of terms ?? []) {
    const [a, b] = raw.split("=").map((x) => x.trim());
    if (!a || !b) continue;
    for (const pair of [[a, b], [b, a]] as TermPair[]) {
      const key = pair.join("\u0000");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pair);
    }
    if (out.length >= MAX_TERMS) break;
  }
  return out.slice(0, MAX_TERMS);
}

function termsInSegment(terms: TermPair[], segment: string): TermPair[] {
  const nospace = segment.replace(/ /g, "");
  return terms.filter(([source]) => {
    const s = source.replace(/ /g, "");
    return s.length >= NOSPACE_MIN ? nospace.includes(s) : segment.includes(source);
  });
}

function glossaryBlock(terms: TermPair[], direction: Direction): string {
  if (terms.length === 0) return "";
  return `${HEAD[direction]}\n${terms.map(([s, t]) => `- ${s} -> ${t}`).join("\n")}`;
}

// --- Messages ---

export function historyText(history: TermPair[]): string {
  return history.map(([src, tgt]) => `${src}¦${tgt}§`).join("");
}

// The exact user message (upstream build_user_message). The glossary sits
// after the history so the prefix stays cacheable.
export function buildUserMessage(
  direction: Direction,
  history: TermPair[],
  currentInput: string,
  terms: TermPair[] = [],
): string {
  const glossary = glossaryBlock(termsInSegment(terms, currentInput), direction);
  const block = glossary ? `\n${glossary}\n` : "";
  return (
    `${STREAMING_PROMPTS[direction]}\n\n<STREAMING_HISTORY>\n${historyText(history)}\n${block}\n` +
    `<CURRENT_INPUT>\n${currentInput}`
  );
}

// Keep generated text from corrupting the ¦ / § framing
export function sanitize(text: unknown): string {
  return String(text ?? "").replace(/¦/g, "｜").replace(/§/g, "；").trim();
}

// Empty (or a bare WAIT/TRANS marker) = WAIT; anything else = TRANS
export function parseResponse(raw: unknown): { action: "WAIT" | "TRANS"; text: string } {
  let text = String(raw ?? "").replace(/<\|im_end\|>/g, "").trim();
  if (!text || /^<?\s*WAIT\s*>?$/i.test(text) || /^<?\s*TRANS\s*>?$/i.test(text)) {
    return { action: "WAIT", text: "" };
  }
  text = sanitize(text.replace(/^(?:<\s*TRANS\s*>\s*|TRANS(?:\s*[:：]\s*|\s+))/i, ""));
  return text ? { action: "TRANS", text } : { action: "WAIT", text: "" };
}

// --- Latency operating points (logit bias on the stop tokens) ---

// Qwen pad/eos ids — the WAIT tokens for this checkpoint
const STOP_TOKEN_IDS = [151643, 151645];
const STOP_TOKEN_BIAS_SCALES: Record<number, number> = { 151643: 1.0, 151645: 1.05 };
export const REPETITION_PENALTY = 1.05;

export const LATENCY_MODES = {
  low: 0.9375009536743164, // commits earlier; lowest latency, slightly lower quality
  native: 0, // the model's own policy
  high: -0.39, // waits longer; highest quality
} as const;
export type LatencyMode = keyof typeof LATENCY_MODES;

export function logitBiasFor(mode: LatencyMode): Record<string, number> | null {
  const tau = LATENCY_MODES[mode];
  if (tau === 0) return null;
  return Object.fromEntries(
    STOP_TOKEN_IDS.map((id) => [String(id), -tau * (STOP_TOKEN_BIAS_SCALES[id] ?? 1)])
  );
}

// --- Source units (client engine) ---

const LATIN_TOKEN = /^[A-Za-z0-9]+(?:[._'’-][A-Za-z0-9]+)*$/;

// Chinese → one unit per character, ASCII words kept whole; English → words
export function splitSource(text: string, direction: Direction): string[] {
  if (direction === "en2zh") return text.trim().split(/\s+/).filter(Boolean);
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      let end = i + 1;
      while (end < text.length && /\s/.test(text[end])) end++;
      tokens.push(text.slice(i, end));
      i = end;
    } else if (/[A-Za-z0-9_'’]/.test(ch)) {
      let end = i + 1;
      while (end < text.length && /[A-Za-z0-9_’'-]/.test(text[end])) end++;
      tokens.push(text.slice(i, end));
      i = end;
    } else {
      tokens.push(ch);
      i++;
    }
  }
  return tokens;
}

export function joinSource(tokens: string[], direction: Direction): string {
  return direction === "zh2en" ? tokens.join("") : tokens.join(" ");
}

export function sourceUnits(tokens: string[], direction: Direction): number {
  return direction === "zh2en" ? tokens.filter((t) => !/^\s+$/.test(t)).length : tokens.length;
}

export function isLatinToken(token: string | undefined): boolean {
  return !!token && LATIN_TOKEN.test(token);
}

// Join emitted segments without damaging English word boundaries
export function joinTranslation(parts: string[], direction: Direction): string {
  const values = parts.map((p) => p.trim()).filter(Boolean);
  if (direction === "en2zh") return values.join("");
  return values
    .join(" ")
    .replace(/\s+([,.;:!?%])/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\b([A-Za-z]+)\s+('(?:s|re|ve|ll|d|m|t)\b)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}
