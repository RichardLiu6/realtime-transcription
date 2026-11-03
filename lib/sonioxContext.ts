// Soniox `context` for a recording: the meeting's subject (the term packs
// picked for it, as `general`) and the terms, within Soniox's limit.
//
// Soniox takes at most 8,000 tokens of context (~10,000 characters) and
// rejects a longer one ("Context is too long"), so the recording would not
// start. All four industry packs together are ~6,100 characters already, and
// an official pack holds up to 400 terms, so the terms are cut to a budget
// estimated on the safe side (its tokenizer is not published).

const MAX_TOKENS = 8000;
// Room for the JSON around the terms and for a wrong estimate
const BUDGET = MAX_TOKENS - 1500;
// One Soniox error names a length of 10000 rather than tokens: stay under
// it in characters too (the JSON as sent)
const MAX_CHARS = 9000;
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g;

// Rough upper bound: 1.5 tokens per CJK character, one per 3 other
// characters, plus one for the separator
export function estimateTokens(text: string): number {
  const cjk = (text.match(CJK) ?? []).length;
  return Math.ceil(cjk * 1.5 + (text.length - cjk) / 3) + 1;
}

export interface SonioxContext {
  general?: { key: string; value: string }[];
  terms?: string[];
}

// `terms` are speech-engine words (pairs already split), in priority order:
// what doesn't fit at the end is left out
export function sonioxContext(
  terms: string[],
  topics: string[]
): { context: SonioxContext | null; dropped: number } {
  const general = topics.length > 0 ? [{ key: "topic", value: topics.join("; ").slice(0, 300) }] : [];
  let used = general.reduce((n, g) => n + estimateTokens(g.key) + estimateTokens(g.value), 0);
  let chars = JSON.stringify({ general }).length + 12;
  const kept: string[] = [];
  for (const term of terms) {
    const cost = estimateTokens(term);
    const length = JSON.stringify(term).length + 1;
    if (used + cost > BUDGET || chars + length > MAX_CHARS) break;
    kept.push(term);
    used += cost;
    chars += length;
  }
  const context: SonioxContext = {
    ...(general.length > 0 ? { general } : {}),
    ...(kept.length > 0 ? { terms: kept } : {}),
  };
  return { context: Object.keys(context).length > 0 ? context : null, dropped: terms.length - kept.length };
}
