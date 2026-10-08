# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ABL-translate: Web-based real-time bilingual transcription for meetings. Browser captures audio via AudioWorklet, streams to a speech engine over WebSocket — Soniox (cloud, speaker diarization) or self-hosted NetEase Youdao Confucius4-R2T2 — then translates via a per-user model from a pool capped at $0.5 per million tokens (default: Seed 2.0 Mini), all via OpenRouter. Main use case: Chinese↔English. Supports 54 languages, two-way/one-way translation modes.

- **Live**: https://realtime-transcription-murex.vercel.app
- **GitHub**: https://github.com/RichardLiu6/realtime-transcription
- **Vercel**: Team `team_HWMvB1FZI23r6nQWdyOmdVw1` / Project `prj_SXHbgT9CGqpRXVhupy3Ve93AMhTW`

## Commands

```bash
npm run dev      # Dev server (localhost:3000, Turbopack)
npm run build    # Production build
npm run start    # Production server
npm run lint     # ESLint
```

## Tech Stack

Next.js 16.3 (App Router, Turbopack) + React 19 + TypeScript 5 + Tailwind CSS v4 + shadcn/ui (Radix). Soniox stt-rt-v5 or Confucius4-R2T2 for real-time STT. Neon Postgres (`pg`) + Vercel Blob for saved meetings, Upstash Redis for live sharing. Translation and summary via OpenRouter (Seed / Gemini / GPT / DeepSeek / Qwen / Hy-MT; per-user, configured in admin). Vercel Edge Config for the user whitelist and assigned models. jose for JWT. Resend for email OTP. Transcript rows are memoized (no virtualization).

## Architecture

### Data Flow

```
Browser AudioWorklet (16kHz PCM16, batched 100 ms / 160 ms frames)
  → WebSocket → Soniox (stt-rt-v5, speaker diarization)      [provider "soniox"]
             or R2T2 ws_server.py /asr_stream_api_v1        [provider "r2t2"]
  ← Soniox tokens / R2T2 incremental text + VAD `reset`
  → useSonioxTranscription hook builds BilingualEntry[]
  → POST /api/translate → translation (OpenRouter model pool)
  → TranscriptPanel (memoized rows)
```

Audio goes directly from browser to the STT engine — the server never touches audio data. Soniox uses a 10-min ephemeral token; R2T2 uses the static `secret_key` from `/api/r2t2-config` (auth-protected).

### STT engines

- **Soniox** (default): cloud, 60+ languages, speaker diarization + language ID.
- **R2T2** (NetEase Youdao Confucius4-R2T2, Qwen3-ASR based): must be self-hosted on a GPU (vLLM + `ws_server.py` from github.com/netease-youdao/Confucius4-R2T2). Append-only output, Chinese/English optimized, **no speaker diarization or language ID** (language comes from the CJK heuristic). The engine picker (status bar → Advanced settings) offers it only when `R2T2_WS_URL` + `R2T2_SECRET_KEY` are set. Protocol: first frame JSON header `{requestId, secret_key, language, use_vad, system_prompt}`, then binary 16 kHz int16 PCM, end with the string `YOUDAO_ONETIME_ASR_STREAM_EOS`. Change `secret_key_list` in `ws_server.py` (defaults to a debug key).

### Translation providers (`app/api/translate/route.ts`)

- **Model pool** (`lib/models.ts`, shared by the route, admin and compare pages): every model ≤ $0.5 per million tokens, input and output. Seed 2.0 Mini (default — fastest and steadiest in the `/api/eval` run), Qwen3.8 Flash, Gemini 2.5 Flash-Lite, Qwen3 235B Instruct (open weights, several hosts), GPT-6 Luna, GPT-4.1 Nano, DeepSeek V4 Flash, Qwen3.7 Flash, MiMo V2.6 Flash, Hy-MT2 30B — all via OpenRouter. A user assigned a model that left the pool gets the default. Prices come from OpenRouter list prices; re-check when changing the pool.
- Every model goes through OpenRouter (`lib/openrouter.ts`, `vendor/model` IDs). No direct OpenAI / Anthropic / Alibaba calls — Alibaba Cloud Model Studio (DashScope, Qwen-MT) was removed and is not coming back; a user still assigned `qwen-mt-*` gets the default.
- **Hy-MT2** (`tencent/hy-mt*`, Tencent's dedicated translation model) has no system prompt and is trained on fixed instruction templates (huggingface.co/tencent/Hy-MT2-30B-A3B): one user message per target language, in parallel; Chinese template + Chinese language names when Chinese is involved, English otherwise. Term pairs present in the text → terminology template; earlier sentences (`memory`) → background template; clause-mode continuation → personalization template. Plain (unpaired) terms are not sent. Sampling per the model card (temperature 0.7, top_p 1.0).
- Chat models get terms and previous sentences in the prompt; multi-target asks for a JSON object per language (`json_schema`, fence-tolerant parse).
- Terms: industry presets (`lib/contextTerms.ts`, Chinese–English) + custom tags, both remembered in localStorage (`termPresets`, `customTerms`). An entry may hold one term in several languages, `a=b=c` (AI-suggested terms). Chat models get each entry as "one term in different languages": use the form in the target language, else translate naturally — a 中文=English pair no longer puts English into a Vietnamese translation. Hy-MT gets a pair only when its target side is in the target language (script check; Latin script only for English, and only from entries with one Latin form).
- **AI-suggested terms** (`/api/terms/suggest`, phone terms sheet): the user describes the meeting and picks its languages (default: the meeting's); Seed 2.0 Mini (Gemini fallback) returns ≤ 30 entries as strict JSON, one form per language. Bounded against misuse: description ≤ 500 chars, ≤ 5 languages, every form checked (≤ 60 chars, no separators), 20 calls per user per day (`lib/rateLimit.ts`, Upstash Redis, else memory). Usage kind `terms`. Typing or pasting splits on `,` `，` `、` `;` `；` and newlines. `a=b` entries are pairs. Speech engines receive the flattened word list (Soniox `context.terms`, R2T2 `system_prompt`). `/api/translate` keeps only the pairs whose either side occurs in the sentence (Latin sides as whole words, plural allowed) plus up to 60 single terms, so large presets don't bloat every prompt. Presets: 保健品生产 (`supplements`), 保健品销售 (`supplement_sales`), 跨境电商 (`ecommerce`), 财务 (`accounting`: US GAAP statements and accounts, AR/AP and cash, manufacturing cost and inventory, close / budget / audit, US taxes, China VAT and export rebates) — mostly pairs, company/brand names (ABL, eguoo, DOCKPER) in each. The generic manufacturing / medical / legal / tech / finance presets are kept in `ARCHIVED_PRESETS` (hidden; a stored selection of them is ignored).
- **Own term packs** (`lib/termPacks.ts`, `/api/term-packs`, client store `lib/useTermPacks.ts`): AI-generated terms (`/api/terms/suggest`, which also proposes a title) are saved as a named pack per user in Postgres `user_term_packs` (≤ 3 per user, ≤ 40 terms; created under an advisory lock, a full user picks one to replace; guests can't save). Shown above the industry packs with "N 个术语 · languages · date" (phone: details sheet with rename / delete; desktop: chips with a popover). Selected like presets, as `u:<id>` keys in `termPresets` (per device); `combineTerms` expands them.
- **Fallback** (`FALLBACK_CHAIN`): on 401/402/403/404/429/5xx, or a network error/timeout, the route tries Seed 2.0 Mini → Gemini Flash-Lite → GPT-6 Luna → GPT-4.1 Nano, skipping the failed model; no Qwen on the default path, Qwen stays selectable per user; an account failure (401/402, no credits / bad key) stops there, since every model shares the OpenRouter account. Different vendors follow the default, so one upstream's rate limit doesn't stop translation (Qwen3.x Flash are served only by Alibaba, from a pool shared by all OpenRouter users; no Alibaba BYOK key — an unactivated one answers 403 `AccessDenied.Unpurchased`). Explicit model requests (compare page) are never substituted. The Chinese banner message names the default model's failure first, then the last backup's.
- SDK clients use `maxRetries: 0` (the fallback chain retries on another model instead) and a 15 s timeout. OpenRouter requests send `reasoning: {enabled: false}` and `provider: {sort: "latency"}`.
- `/api/summarize` uses Seed 2.0 Mini, falling back to Gemini Flash-Lite.
- **`/api/eval`** (preview deployments only, 404 elsewhere; preview URLs are behind Vercel Authentication so it skips the app login): runs a fixed zh/en/es sentence set (code-switching, unfinished speech, terms, multilingual columns, clause continuation) through each model via the real handler; `?models=a,b&rounds=2&cases=a,b`. Results are also logged as `[eval] case=… model=…` lines.
- Every translation logs `[translate] model=… ms=… in=… out=… reasoning=…` to the Vercel runtime logs (reasoning > 0 means the model thought anyway).
- If the user's assigned model can't be read (Edge Config down), the route translates with the default model instead of failing.

### Usage and cost (`lib/usage.ts`, admin only)

- Postgres `usage_monthly` (same database as saved meetings, created on first use): one row per user × UTC month × kind × model, incremented atomically (`INSERT … ON CONFLICT DO UPDATE`), written with Next's `after()` so it completes after the response. Emails lower-cased; meeting-code guests are `guest`.
- Kinds: `translate` (sentence), `provisional` (partial-sentence re-translations — most of the calls), `summary`, each with input/output tokens and the exact USD cost OpenRouter returns in `usage.cost`; attributed to the model that answered (after fallback); Hy-MT sums its per-target calls. `stt`: Soniox seconds reported by the page on stop (`/api/usage`, capped at a day per report); shown with a list-price estimate ($0.12/h, `SONIOX_USD_PER_HOUR`) only for months without Soniox's own figures.
- **Soniox actual cost** (`lib/sonioxUsage.ts`): `/api/soniox-token` binds the user's email (lower-cased; guests `guest`) to each temporary key as `client_reference_id`, so Soniox's usage logs (`GET /v1/usage-logs`: per request, audio duration and exact `cost_usd`) say who transcribed. The logs reach only 91 days back (31-day windows), so they are copied into Postgres `soniox_usage` (one row per request uuid; `sync_state` remembers how far): daily by Vercel Cron (`/api/cron/sync-soniox-usage`) and when the admin table opens if the last copy is over 5 min old (re-reads 2 days of overlap). A month with requests carrying a user shows Soniox's minutes and cost per user, plus a 未标记转录 row for requests without one (before attribution started, Soniox console); earlier months keep the estimate with Soniox's month total beside it. If Soniox can't be read, the stored copy is shown with the error. `SONIOX_API_BASE_URL` overrides the API host (tests).
- Admin page 用量与费用: month picker, per user (most expensive first) transcription minutes, calls (整句 / 临时 / 纪要), tokens, translation cost, transcription estimate, total; per-model breakdown on hover; totals row. Users don't see usage. Counting started 2026-09; the old Edge Config `usage` (racy read-modify-write, no provisional calls, no cost) is no longer written.

### Streaming translation (translate while the sentence is spoken)

翻译方式 **整句 | 分句 | 同传** (status bar → Advanced settings) (`config.translationEngine` = `llm` | `clause` | `t3po`). Both streaming engines expose `feed` / `flush` / `close`, consume only *final* ASR text from any STT engine, and are append-only. The hook plans **routes per segment** (`streamRoutesFor`): one or more engines, each covering some target languages; commits are merged per language (`commitStreamParts`), and the segment is done when every route has flushed. With 同传 in multilingual mode, zh↔en columns go through T3PO and all other columns (incl. same-language) through the clause engine; outside multilingual mode 同传 only covers zh↔en. On any failure the session falls back to sentence translation (banner stays) and affected sentences are retranslated whole.

**分句 (`lib/clause/engine.ts`)** — any translation API, any language pair, one or several targets per call. Commits a clause at `，。！？；：…` or ASCII `,.!?;:` followed by a space (so `3.5` doesn't split); clauses under 4 CJK chars / 3 words merge into the next; 20 units without punctuation forces. Each clause goes to `/api/translate` with `continuation: {sourceSoFar, translationsSoFar: {lang: text}}` (`translationSoFar` string also accepted for one target): chat models get a "[Sentence so far] / [Translation so far] / [Next part]" prompt and output only the continuation (per language as JSON when multi-target); Hy-MT gets it in its personalization template. Client guards: a restated prefix is stripped; an empty continuation is retried as a standalone clause.

**同传 (Youdao Confucius4-T3PO)** — Chinese↔English only, needs a self-hosted model.

- `lib/t3po/protocol.ts`: prompts, glossary, response parsing, source splitting — ported byte-for-byte from github.com/netease-youdao/Confucius4-T3PO (`inference/prompts.py`, `glossary.py`, `translation.py`, `latency.py`). The prompt is part of the model interface; don't edit it independently.
- `lib/t3po/engine.ts`: client-side port of upstream `TranslationEngine` (one per direction; committed history `src¦tgt§…` + buffer; empty reply = WAIT, non-empty = TRANS; forced step at sentence end / 20 units). Ops are serialized per engine and feeds arriving mid-call are merged.
- `/api/simul` (stateless): one WAIT/TRANS step against an OpenAI-compatible server (`vllm serve netease-youdao/Confucius4-T3PO`). Forced steps send `min_tokens: 1`; `T3PO_LATENCY_MODE` low/high adds upstream's calibrated `logit_bias` on the stop tokens.
- Only *final* ASR text is fed (Soniox final tokens / R2T2 chunks are append-only). `中文=English` terms go into T3PO's glossary block.
- On any step failure the session switches to sentence translation (banner stays); segments with untranslated leftovers are retranslated whole.

### Interface languages (`lib/i18n.ts`)

- UI in 中文 / English / Español / Tiếng Việt. `useT()` / `t(key, vars)`; every locale is a `Record<TranslationKey, string>`, so a missing string fails the type check.
- Locale: stored choice (localStorage `uiLocale`, set by `components/LanguageSwitcher.tsx` in the status bar and on /login), else the browser language, else English. `useSyncExternalStore` with an English server snapshot — no hydration mismatch; switching re-renders without reload and updates `<html lang>`.
- Server messages: `/api/translate` localizes its error banner from the `uiLocale` the client sends; `/api/auth/*` return a `code` that /login maps to `auth_<code>`. Preset chips use `preset_<key>`. Meeting-language names everywhere (selects, chips, table headers) come from `useLanguageName()`: the native name plus the name in the interface language via `Intl.DisplayNames` ("中文 · Chinese", "English · 英语"). The admin pages stay Chinese.

### Two-Tier Authentication

**User login** (`/login`): Email OTP → `auth_token` cookie (15-day JWT)
- Whitelist stored in Vercel Edge Config (`auth_users` key)
- OTP: 6-digit, 5-min validity, SHA-256 hashed

**Admin login** (`/admin/login`): Password → `admin_token` + `auth_token` cookies (24h JWT)
- Admin gets both tokens: access to main app + admin panel
- Main page displays "admin" as username

**Middleware** (`middleware.ts`): All routes require `auth_token` except `/login`, `/admin/login`, `/api/auth/*`, `/api/admin/auth`, `/api/eval` (404 outside preview deployments), shared captions (`/live/*` and `GET /api/live/*`) and `/api/cron/*` (checks `CRON_SECRET` itself). Admin routes require `admin_token`.

### Core Hook: useSonioxTranscription.ts

Central logic for the entire app:
- Microphone captured **raw** by default (browser echoCancellation / noiseSuppression / autoGainControl off — they can drop quiet or distant speakers and cancel remote participants as echo); the 降噪 toggle in Advanced settings (`config.audioProcessing`, localStorage `audioProcessing`) turns them on
- AudioWorklet setup (buffers frames in the worklet), linear interpolation resampling for non-16kHz contexts
- WebSocket connection to Soniox or R2T2 (`config.provider`)
- Token processing: splits original vs translation tokens via `translation_status`
- Speaker change detection triggers segment finalization
- Endpoint detection (all tokens final) auto-finalizes segments
- Language detection: CJK character ratio >20% → detected language
- Provisional translation: while a segment is still being spoken, re-translates the partial text at most once per second (`provisional: true`, shown with a dotted underline — not faded); the final translation replaces it, or the provisional result is promoted when it already covers the final text
- Segment language = majority language of its tokens, weighted in units (1 per CJK character, 1 per Latin word — not letters), not the first token (a leading "嗯" used to mislabel English sentences as ZH)
- Auto-merge heuristic: short same-language segments adopt previous speaker
- Starting a new recording **continues** the transcript (entry ids keep counting, timestamps offset past the last entry); only 新会议 (`clearEntries`) clears it
- Speaker ids are per recording, `"<recording>:<speaker>"` (Soniox restarts its numbering on every WebSocket session; R2T2 is always speaker 1). Default labels (`defaultSpeakerLabel`): "Speaker 1" in the first recording, "Speaker 1 (#2)" in later ones. The recording index advances on start when the transcript has entries and resets with `clearEntries`
- Default names are shown in the interface language at display time only (`speakerDisplayName` in `hooks/useSpeakerManager.ts`: "说话人 1 (#2)" / "Hablante 1" / "Người nói 1"); ids and given names are never changed. A typed name is also matched against these displayed names
- Renaming: click a speaker name on a transcript row (inline input, Enter saves / Esc cancels) or in the SpeakerPanel. Giving a speaker a name another speaker already has — typed, or via the "同一人" quick picks — means the same person: `mergeSpeaker` moves their entries to the existing id and aliases the engine speaker, so later sentences keep the name, color and word count. This is how names carry over stop/start within a meeting. Export uses the names as shown (given, or the localized default)
- One sentence to another speaker: the small person-pen button after a finalized row's text (visible on hover / focus, always on touch screens) lists the other speakers and calls `reassignSpeaker(entryId, speakerId)` for that entry only; word counts and colors follow
- Speaker colors: `SpeakerInfo.color` (hex, from `SPEAKER_COLORS` in `useSpeakerManager.ts`: 8 colors, each ≥ 4.5:1 on white, no red) is the single source for transcript names, the SpeakerPanel dots and bars; a merged-away speaker's color is freed for the next one
- 新会议 asks for confirmation (`confirm_new_meeting`) when there is a transcript, in every layout
- Meeting settings (languageA/B, translationMode, targetLangs) persist in localStorage via `lib/useStoredState.ts`
- A segment of nothing but punctuation (a trailing `。` finalized on its own) is not a sentence: its mark is appended to the previous entry and it is never translated
- stop() sends end-of-audio and drains trailing results before closing (3 s timeout)

### Key Types (types/bilingual.ts)

- `BilingualEntry`: id, speaker, speakerLabel, language, originalText, translatedText, interimOriginal/Translated, isFinal, startMs, endMs, timestamp
- `SonioxToken`: text, is_final, speaker, start_ms, end_ms, translation_status ("none"|"original"|"translation"), language
- `SonioxConfig`: provider, languageA, languageB, targetLangs, contextTerms, translationMode ("two_way"|"one_way"|"presentation"|"transcribe")

### Translation modes

- **two_way / one_way**: one target language per sentence, flowing transcript view.
- **transcribe** (UI label "仅转录 / Transcribe"): the transcript only. Nothing is translated — no sentence, provisional or streaming requests (`skipsTranslation` in the hook, shared with the admin compare page's `skipTranslation` option). The languages picker is just the spoken languages (`languageA`, one or several or any; `FromToLanguages sourceOnly`), sent as Soniox `language_hints`. Flowing transcript view; presentation mode shows the originals with no view / language choice (`sentenceIn` returns the original); live sharing works (viewers get the 原文 column only).
- **presentation** (UI label "多语言 / Multilingual"): table with an always-present **原文** column (the transcript, shown exactly once) plus one column per `targetLangs` entry (default 中文 + English). Every sentence is translated into **every** column, including the spoken language — that column keeps the utterance as said; foreign words may stay but get their meaning in brackets on first use (`这个 batch（批次）的 yield（良率）`; SAME_LANGUAGE_RULES — chat models only; Hy-MT can't take the instruction and just translate). Costs one extra target per sentence by design. Works with 整句, 分句 and 同传. Soniox `language_hints` = source languages ∪ `targetLangs`.
  - `components/PresentationPanel.tsx`: the # column shows the speaker (display name, speaker color). A column whose text equals the original (ignoring punctuation / case, `sameText` in `lib/meetingLanguages.ts`) is muted with a "= 原文" marker. When the panel is narrower than (columns × 250 px + 72) — ResizeObserver on the panel, so the sidebar counts — it switches to **cards** (speaker + original, then each language with its name) with a 显示 filter (全部 / 原文 / one language; localStorage `multiFilter`). Scroll-to-latest button as in TranscriptPanel.

### Live caption sharing (multilingual and transcribe-only modes)

- The host (logged in, multilingual or 仅转录 mode — the latter shares `targetLangs: []`, so viewers see the 原文 column only) clicks 分享字幕 in the status bar (`components/LiveShareButton.tsx`) → `POST /api/live` creates a room (128-bit random id = the access; host key = HMAC of the room id with `JWT_SECRET`, not a JWT so it can't pass as a login) → link `/live/<room>`. Leaving those modes or 停止分享 ends the room: an `ended` batch for viewers already watching (they stop at once), the room reads as missing for new ones and expires 60 s later.
- `hooks/useLiveShare.ts`: once a second publishes the entries whose object changed since the last publish (`toLiveEntry`, ≤ 150 per publish) plus the room info (`targetLangs`, `languageA`, speakers with given names and colors, recording) when it changed; a heartbeat every 15 s refreshes the room's expiry and tells viewers the host is there. 新会议 publishes a `reset`. Failed publishes are retried on the next tick.
- Viewer `app/live/[room]/page.tsx` (no login; `/live/*` and `GET /api/live/*` are public in middleware): polls `GET /api/live/<room>?since=<version>` every second, every 2 s after 30 s without new entries (3 s after errors, immediately when the tab becomes visible) — a snapshot first, then the batches since its version. A delta read is one Redis command (Upstash bills per command); `&check=1` every 15 s also confirms the room exists. Picks columns among 原文 + the host's `targetLangs` (at least one; localStorage `liveLangs`; default 原文 + the interface language), rendered by `PresentationPanel` (`viewer`, `showOriginal`) — table or cards. Status: 直播中 / 已暂停 / 发起人已离线 (no heartbeat for 45 s, server clock) / 重试中 / 已结束 (room gone; keeps what it has) / not found. Export writes the picked columns; presentation mode works (no start/stop).
- Storage (`lib/live/store.ts`): Upstash Redis over REST (`/multi-exec`; `KV_REST_API_URL`/`KV_REST_API_TOKEN` from the Vercel integration, or `UPSTASH_REDIS_REST_*`). Per room a hash (latest entry per id + `_info`) and a list of batches (version = list length), written in one transaction; 24 h expiry refreshed by the heartbeat. Without Redis a local server keeps rooms in memory; on Vercel (`VERCEL=1`) sharing is then unavailable (`GET /api/live` → `available: false`, button hidden) — Vercel instances share no memory.
- Translation happens once on the host (every column), so viewers cost nothing extra; a viewer can only pick languages the host has.

### Saved meetings (text autosave + optional audio)

- Rules (decided with the owner): the recorder owns a meeting; they can share it by email (read-only); admins see only a content-free list (`/api/admin/saved-meetings`: owner, time, duration, sentences, audio size, share count); meetings are deleted 1 year after they start; audio is opt-in per meeting (off by default, consent `confirm`, red indicator while recording); text is always autosaved. Guests (meeting-code logins, `role: "guest"`) can't save.
- `hooks/useMeetingAutosave.ts`: a meeting is created (`POST /api/meetings`) when a recording starts; every 3 s the finalized entries whose object changed go to `PUT /api/meetings/<id>/entries` (`toSavedEntry`, ≤ 200 per call) with speakers, settings and duration; also on tab hide (keepalive) and right after stopping. Stop/start continues the meeting; 新会议 (a transcript that had entries is cleared) ends it and the next recording starts a new one. An empty transcript never overwrites saved speakers.
- `hooks/useMeetingRecorder.ts`: MediaRecorder on the hook's live `mediaStream` (Opus 32 kbps, webm; mp4 on Safari), 5 s chunks into IndexedDB (`lib/meetings/recordingCache.ts`). Each start/stop is a segment `meetings/<id>/<idx>.<ext>` with `offsetMs` = `getTranscriptTimeMs()` at its start; when it ends it is duration-fixed (`fix-webm-duration`), uploaded straight from the browser (`@vercel/blob/client` `uploadPresigned()`, private, presigned URL from `/api/meetings/<id>/recordings/upload` via `issueSignedToken` + `handleUploadPresigned` — works with OIDC-connected stores, which have no read-write token; or `PUT …/recordings/local` on a dev server), registered (`POST …/recordings`), then removed from IndexedDB. Leftovers (crash, closed tab) upload on the next page load.
- Timeline: a new recording starts 1 s after both the last sentence and the previous recording's audio (`useSonioxTranscription` start), so segments never overlap and `entry.startMs − segment.offsetMs` is the position in that segment's audio.
- Pages: `/meetings` (own + shared, search over title and text incl. translations, empty meetings hidden) and `/meetings/[id]` (transcript with column picker for multilingual — localStorage `meetingLangs` —, click a time to play from there across segments, playing sentence highlighted; owner: title, speaker names, summary via `/api/summarize`, sharing, delete; export). Opened in a new tab from the status bar (save status link) and the user menu (我的会议), so the recording page keeps its state. Status bar: `components/MeetingSaveControls.tsx`.
- Server: `lib/meetings/db.ts` (`pg` Pool + `attachDatabasePool`; `DATABASE_URL`/`POSTGRES_URL` from the Neon integration; tables created on first use), `repo.ts` (queries, access: owner / shared / none — none answers 404), `guard.ts`, `audio.ts` (Blob when `BLOB_STORE_ID` (OIDC) or `BLOB_READ_WRITE_TOKEN`, else local files outside Vercel; playback = redirect to a 1 h signed URL (`issueSignedToken` + `presignUrl`), local files served with Range). Recording pathnames are validated against the meeting (`recordingPath.ts`).
- **补翻译** (`components/meetings/BackfillTranslation.tsx`, owner only, multilingual and 仅转录 meetings): pick languages (preselected: the ones already there, else the interface language), and only sentences missing them are translated — never into a sentence's own language (that column shows the original). The browser calls `/api/translate` per sentence (4 at a time; missing languages only; previous 3 sentences as context; the terms selected on the recording page in this browser), so model, fallback and usage work as live; results go through `PUT …/entries` every 10 sentences. Progress, stop, and a count of what's left (a second run finishes it; an account failure 401/402 stops at once). A transcribe meeting with translations shows the language columns. `saveEntries` merges stored `translations` under incoming ones, so the recording page re-saving a sentence (rename, speaker change) never drops them.
- Cleanup: Vercel Cron (`vercel.json`, daily) → `/api/cron/cleanup-meetings` (needs `CRON_SECRET`; public in middleware) deletes expired meetings and day-old empty ones with their audio.

### Feedback (`lib/feedback.ts`)

- `components/FeedbackForm.tsx` (`topic` "general" | "pip", optional `context()` for the caller's state) → `POST /api/feedback` → Postgres `feedback` (same database; id, lower-cased email, time, topic, message, context jsonb). Logged-in users only (guests 403 `guest`, no database 503); message 1–2000 chars, topic from `FEEDBACK_TOPICS`, context over 4 KB dropped, 20 per user per day (`lib/rateLimit.ts`). The form always adds interface locale, user agent, viewport, `nativeApp` and page path.
- Entry points: phone settings (意见反馈 row → bottom sheet), desktop user menu (the popover turns into the form). PiP mounts its own `topic="pip"` form. Admin page section 意见反馈: latest 200 (`/api/admin/feedback`), context as key: value chips.

### Presentation (projector) mode (`components/PresentationMode.tsx`)

- Not the multilingual mode above: a full-screen caption view of the page's state for a meeting-room projector. Opened by the 演示模式 button in the status bar (the one bar every layout, incl. mobile, shows) or `F` (ignored while typing in a text field); Esc / F / the exit button close it. `usePresentationMode()` requests the Fullscreen API when available (else a full-viewport overlay) and leaves the mode when the browser leaves full screen (its Esc never reaches the page). Only displays: recording keeps running when entering or leaving; Start/Stop in the strip call the page's handlers.
- Control strip over the captions (captions never move), auto-hides after 3 s without activity (resting the pointer on it doesn't count — only moving over it): recording dot + timer, Start/Stop, A−/A+ (20–80 px, default 32), 深色 (default) / 高对比 (yellow on black) / 浅色 — every text color ≥ 7:1, speaker names use lighter shades on dark —, view, language, 只显示完整句子 (hides live tails and provisional translations, like Wordly).
- Views (two-way / one-way): 原文 + 译文; 只看一种语言 (`sentenceIn` in `lib/meetingLanguages.ts`: the original if spoken in that language, else `translatedText` when that is the sentence's target, else the original); 左右对照 when the meeting has exactly two languages (`meetingLanguages`: A left, B right). The single-target rule (`singleTargetLanguage`) is shared with the hook.
- Multilingual: a 语言 picker of lines instead — 原文 and/or any columns, at least one (localStorage `presentLangs`; until picked, what the old view showed: 原文 + the chosen language, or that language alone). One line = the one-language view (`sentenceIn`); several: 上下排列 (stacked under the original, a column identical to the original skipped, translation lines labelled with the language code when there are 2+) or 左右并排 (2–4 lines, one column each, with headers; 3 columns scale the chosen text size to 85 %, 4 to 75 %; the speaker's own-language cell, which repeats the original, is muted).
- Captions are bottom-anchored (older sentences scroll off the top under a fade, the latest 30 rendered), left-aligned, `min(70ch, 68vw)` wide (BBC guidance), line height 1.45; provisional = dotted underline, live tail lighter. Settings in localStorage: `presentFontSize`, `presentTheme`, `presentView`, `presentLanguage`, `presentLangs`, `presentFinalOnly`.

### Installable app (PWA)

- `app/manifest.ts` (`/manifest.webmanifest`: standalone, icons in `public/icons/` incl. maskable), `public/apple-touch-icon.png` + `appleWebApp` metadata in `app/layout.tsx` (iPhone 添加到主屏幕), favicon from the same icon. Icons are generated (dark tile, "ABL", blue waveform).
- `public/sw.js`, registered by `components/ServiceWorker.tsx` in production only: caches nothing; it only answers page loads that fail offline with a bilingual retry page. Needed for Chrome / Edge installability.
- The manifest, `sw.js`, icons and apple-touch icon are public in middleware (browsers fetch them without cookies).
- **Mobile app** (`mobile/`, see `mobile/README.md`): Capacitor 8 shell loading the live site; internal use (~20 people): Android APK from GitHub Actions, iPhone via TestFlight internal testing. Native plugin `NativeStt` (Swift / Java) owns the microphone and the engine WebSocket, so recording continues with the screen locked (iOS background audio; Android foreground service type microphone + wake lock). Web side `lib/native/stt.ts`: `nativeStt()` detects the app; `NativeSocket` looks like a WebSocket to the hook (native sends the open message and audio; the page gets numbered engine messages and fills gaps with `drain()` after being suspended; `progress` gives the samples sent for the timeline; Soniox gets a keepalive while no audio flows). In the app the hook skips getUserMedia / AudioWorklet, and 录音存档 is hidden. **iOS floating captions** (PiP, `CaptionPip.swift`; web: `lib/native/pip.ts`, the 悬浮 button in the phone recording bar, 更多 → 悬浮字幕 settings `components/phone/PipSettings.tsx`): the hook calls `pipConfigure` (mode, languages, terms, `/api/translate` URL, prefs, labels) on a native Soniox start; native builds sentences from the engine messages and, only while the window shows (the page is suspended in the background), translates them itself (cookie from the web view) clause by clause like 分句 (append-only continuations; a provisional translation of the part being spoken every 1.5 s). User settings, per device (localStorage `pipPrefs`, applied live via `pipPrefs`): text size 小/中/大/特大 and the original's share (hidden / 2:8 / 4:6). New speaker = new line with "– "; dims after 6 s quiet, clears after 15 s. The window's ⏪ ⏩ page through earlier sentences, ⏸ holds the captions. Auto-starts when the app leaves the screen while recording, closes 4 s after the recording ends. Broadcast mode plays mixed silence so iOS allows PiP and keeps the app running. Single target per sentence (multilingual: the interface language's column). No PiP in the simulator: the frame is drawn in a corner instead. Feedback on it (`FeedbackForm topic="pip"`) carries the prefs and `pipStats` (requests, failures, average ms). `mobile/` is excluded from tsconfig, ESLint and Vercel (`.vercelignore`). Workflows `.github/workflows/mobile-android.yml` (APK artifact) and `mobile-ios.yml` (unsigned simulator build).
- Next: Electron desktop app (Windows + macOS: system audio + mic, floating captions, auto-update, download page).

### Phone layout (`components/phone/`)

- Below `lg` the status bar and desktop bars are hidden; `PhoneChrome` wraps the transcript panel. One main button per screen: a big start button when there is nothing yet, stop (with the timer) while recording, 继续录音 / 导出 / 新会议 / 更多 after stopping.
- Three modes in 会议设置 instead of four: 互译 = two_way with 2 languages, presentation with 3+ (adding or removing a language switches; `applyMutual`), 单向翻译 = one_way (target defaults to the interface language), 纯转录 = transcribe. A scene hint (面对面对话 / 多人会议 / 听讲 / 只记录) says what will happen. Settings are locked while recording.
- Sidebar (☰): 新会议, saved meetings (`/api/meetings`, grouped today / this week / earlier; hidden for guests), the current meeting on top, settings & account at the bottom. A meeting opens in `MeetingViewer` (an iframe of `/meetings/<id>` over the page, so a recording continues); `/meetings` hides its "back" link when framed.
- Export on touch devices uses the system share sheet (`navigator.share` with the file; the iOS app's WebView ignores download links), else the download.

### Idle screen

`components/ReadyCard.tsx` (TranscriptPanel and PresentationPanel when there are no entries): 准备就绪 + mode and languages, a large Start button, one-line tips (terms presets, rename by clicking a name, F for presentation mode — hidden on touch screens). Text ≥ 4.5:1.

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/soniox-token` | POST | 10-min ephemeral Soniox token |
| `/api/r2t2-config` | GET/POST | R2T2 availability / connection details |
| `/api/simul` | GET/POST | T3PO availability / one simultaneous-translation step |
| `/api/usage` | POST | Record STT seconds (Soniox only; Postgres usage table) |
| `/api/translate` | POST | LLM translation (single or multi-target; usage recorded per call, provisional separately) |
| `/api/summarize` | POST | Meeting summary generation |
| `/api/terms/suggest` | POST | AI term suggestions + pack title (20/day per user) |
| `/api/term-packs` | GET/POST | My term packs / save one (`replaceId` when full) |
| `/api/term-packs/[id]` | PATCH/DELETE | Rename / delete a pack |
| `/api/terms/suggest` | POST | AI-suggested terms for a described meeting, in the chosen languages |
| `/api/live` | GET/POST | Sharing available? / start sharing (new room + host key) |
| `/api/live/[room]` | GET/POST/DELETE | Viewer poll (public) / host publish / stop sharing |
| `/api/meetings` | GET/POST | My + shared meetings (`?q=`) / new meeting |
| `/api/meetings/config` | GET | Saving available? recordings `blob` / `local` / null; admins also get `missing` env vars |
| `/api/meetings/[id]` | GET/PATCH/DELETE | Meeting (owner or shared) / title, speakers, summary / delete with audio |
| `/api/meetings/[id]/entries` | PUT | Autosave sentences + speakers + settings |
| `/api/meetings/[id]/shares` | POST/DELETE | Share by email / unshare |
| `/api/meetings/[id]/recordings` | POST | Register an uploaded segment |
| `/api/meetings/[id]/recordings/upload` | POST | Presigned Blob upload URL (private) |
| `/api/meetings/[id]/recordings/[idx]` | GET | Play: signed Blob URL redirect / local file with Range |
| `/api/admin/saved-meetings` | GET | Admin: content-free list of meetings |
| `/api/admin/usage` | GET | Admin: usage and cost per user (`?month=YYYY-MM`) |
| `/api/feedback` | POST | User feedback (logged-in users, 20/day) |
| `/api/admin/feedback` | GET | Admin: latest 200 feedback rows |
| `/api/cron/cleanup-meetings` | GET | Daily cleanup (CRON_SECRET) |
| `/api/cron/sync-soniox-usage` | GET | Daily copy of Soniox usage logs (CRON_SECRET) |
| `/api/auth/send-code` | POST | Email OTP |
| `/api/auth/verify-code` | POST | Verify OTP, issue JWT |
| `/api/auth/me` | GET | Current user info (email, name, role) |
| `/api/auth/logout` | POST | Clear cookies |
| `/api/admin/auth` | POST | Admin password login |
| `/api/admin/users` | GET/POST/DELETE | User CRUD |

### Component Hierarchy

```
<Home> (app/page.tsx)
├── <StatusBar>              # Top: recording dot + the only timer; Advanced settings (gear popover:
│                            #   engine, 整句/分句/同传, 降噪, desktop layout — locked while recording;
│                            #   unavailable R2T2/同传 hidden, shown disabled with env-var hints to admins),
│                            #   interface language, user menu (admin panel, log out), 演示模式 button
├── <Sidebar>                # Left: language, mode, speaker, terms, record/export
│   ├── <AudioWaveButton>    # Record/stop with waveform
│   ├── <TranslationModeToggle>
│   ├── <BetweenLanguages> / <FromToLanguages>
│   ├── <TermsPanel>         # Context terms with preset categories
│   └── <SpeakerPanel>       # Speaker rename + word count
├── <PhoneChrome>            # Phone layout (< lg; components/phone/): ☰ sidebar (new meeting, saved
│                            #   meetings opened in an in-app frame, settings & account), language pill →
│                            #   会议设置 (互译 / 单向翻译 / 纯转录; lib/phoneModes.ts maps them onto the four
│                            #   modes), big start button, stop + timer, 更多 (present, terms, speakers,
│                            #   share, audio archive). Desktop: renders only the transcript panel
├── <DesktopTopBar>          # topbar layout: preset chips that fit + "+N", always a Terms (N) button
├── <TranscriptPanel>        # Memoized rows (role=log); translation in a ruled, indented block,
│                            #   upright and ≥ 4.5:1 contrast; <ReadyCard> when empty
├── <PresentationPanel>      # Multilingual table / cards (instead of TranscriptPanel); also the /live viewer
├── <MeetingSaveControls>    # Status bar: save status (link to the meeting) + 录音存档 switch
└── <PresentationMode>       # Full-screen projector captions (overlay, F / Esc)
```

## Environment Variables

```bash
SONIOX_API_KEY=...           # Soniox STT API key
OPENROUTER_API_KEY=sk-or-... # Translation pool + summaries (required)
R2T2_WS_URL=wss://.../asr_stream_api_v1  # Self-hosted R2T2 (optional)
R2T2_SECRET_KEY=...          # Must match secret_key_list in ws_server.py
T3PO_BASE_URL=https://.../v1 # OpenAI-compatible server running Confucius4-T3PO (enables 同传)
T3PO_API_KEY=...             # Optional bearer token (vLLM --api-key)
T3PO_MODEL=Confucius4-T3PO   # Served model name
T3PO_LATENCY_MODE=native     # low | native | high
KV_REST_API_URL=...          # Upstash Redis (Vercel Marketplace) — live caption sharing; or UPSTASH_REDIS_REST_URL
KV_REST_API_TOKEN=...        #   ...and its token; or UPSTASH_REDIS_REST_TOKEN
DATABASE_URL=postgres://...  # Neon (Vercel Marketplace) — saved meetings; or POSTGRES_URL
BLOB_STORE_ID=...            # Vercel Blob (private store) — meeting audio; newer stores (OIDC auth, no token)
BLOB_READ_WRITE_TOKEN=...    #   or this, on older stores
CRON_SECRET=...              # Vercel Cron auth for /api/cron/* (meeting cleanup, Soniox usage copy)
JWT_SECRET=...               # JWT signing secret
ADMIN_PASSWORD=...           # Admin login password
RESEND_API_KEY=...           # Email OTP delivery
RESEND_FROM_EMAIL=...        # Sender email
EDGE_CONFIG=...              # Vercel Edge Config URL
EDGE_CONFIG_ID=...           # Edge Config ID
VERCEL_API_TOKEN=...         # For Edge Config updates
VERCEL_TEAM_ID=...           # Vercel team
```

## Known Issues

| Issue | Solution |
|-------|----------|
| WebSocket disconnect | Shows error, recording stops (no auto-reconnect) |
| AudioContext not 16kHz | Linear interpolation resampling on the main thread |
| Next.js 16 Turbopack errors | `turbopack: {}` in next.config.ts |

## Second Brain

- `second-brain/TODO.md`（进行中的任务）、`DONE.md`（已完成）、`long-term.md`（长期事实，每条 2–3 行）；详细内容放 `docs/` 并从这些文件链接过去，second-brain 只放索引级摘要
- 判断：会完成的 → TODO；不会完成/长期事实 → long-term；完成或过时 → 移到 DONE；不确定 → long-term
- TODO 每项一个小节：`## #序号 [日期] 标题 — 状态`（无标记=待办、进行中、暂停）；序号全局递增不复用；超过 5–6 行把细节移到 docs/
- 同一主题改原条目，不追加重复条目
