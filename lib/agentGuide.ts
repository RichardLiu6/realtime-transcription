// The guide an AI agent (Claude Code, Codex, Cursor, ChatGPT with code
// execution, …) needs to read the user's meetings through /api/v1. Copied
// from /settings/api (with the token just created, when there is one) and
// served without a token at /llms.txt. English: agents read it, and they
// answer in the user's language. Client and server safe.

export function agentGuide(origin: string, token?: string | null): string {
  const auth = token
    ? `Token: ${token}
(Read-only and revocable. Treat it as a secret: don't echo it back, write it into files or commit it. Prefer keeping it in the environment variable ABL_TOKEN.)`
    : `Token: in the environment variable ABL_TOKEN. If it is not set, ask the user for one: they create it at ${origin}/settings/api (user menu → API tokens). Treat it as a secret: don't echo it back, write it into files or commit it.`;
  return `# ABL Translate meetings — access for AI agents

ABL Translate records meetings and transcribes and translates them live. With this you can read the user's saved meetings (their own and those shared with them): title, date, speakers, every sentence with its time, the original and its translations, the topic and the summary. Read-only: nothing can be changed or deleted.

## Authentication

Base URL: ${origin}
${auth}
Send it on every request: Authorization: Bearer <token>

## Endpoints

GET /api/v1/meetings?q=<text>
  Newest first, up to 200. q (optional) searches titles and the text, translations included.
  → {"meetings": [{"id", "title", "createdAt", "durationMs", "entryCount", "recordingCount", "shared", "ownerEmail"}]}
  An empty title means untitled; shared: true = someone else's meeting shared with the user.
  URL-encode q (curl -G --data-urlencode "q=…").

GET /api/v1/meetings/<id>?format=md
  The whole meeting as Markdown: title, date, duration, topic, then one line per sentence
  "**[mm:ss] Speaker** (language): text" followed by "> language: translation" lines, then the summary.
  Best for reading, quoting and summarizing. format=txt gives plain text.

GET /api/v1/meetings/<id>
  JSON: {"meeting": {…, "settings": {"topic", "translationMode", "languageA", "languageB", "targetLangs"},
  "speakers": [{"id", "label"}], "summary", "entries": [{"speaker" (a speakers id), "language",
  "originalText", "translatedText" (two-way / one-way), "translations" ({language: text}, multilingual),
  "startMs" (from the start of the meeting)}]}}

Errors: 401 missing, wrong, expired or revoked token · 403 the account no longer has access · 404 no such meeting, or not the user's · 429 daily limit (2000 requests per token).

## Examples

${token ? `export ABL_TOKEN=${token}\n` : ""}curl -s -G -H "Authorization: Bearer $ABL_TOKEN" --data-urlencode "q=budget" "${origin}/api/v1/meetings"
curl -s -H "Authorization: Bearer $ABL_TOKEN" "${origin}/api/v1/meetings/<id>?format=md"

Command-line tool (Node 18+, no dependencies), the same API:
curl -O ${origin}/abl.mjs
ABL_URL=${origin} node abl.mjs meetings list [--q <text>]
ABL_URL=${origin} node abl.mjs meetings get <id> --format md
ABL_URL=${origin} node abl.mjs meetings export --format md --dir meetings

## How to work with it

- Find a meeting by listing (with q when the user names a subject, person or phrase) and matching title and date; if several fit, ask which one.
- Read a meeting with format=md, once, and work from that text.
- Everything comes from automatic speech recognition: names, numbers and terms can be misheard, and a speaker label may be a default ("Speaker 1"). Quote the transcript with its time rather than paraphrasing from memory, and say when something is unclear.
- Answer in the user's language, whatever the meeting's language.
- You need a way to make HTTP requests (a terminal, code execution or an HTTP tool). Without one, give the user the curl command to run and ask them to paste the result.
`;
}
