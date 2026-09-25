# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ABL-translate: Web-based real-time bilingual transcription for meetings. Browser captures audio via AudioWorklet, streams to a speech engine over WebSocket — Soniox (cloud, speaker diarization) or self-hosted NetEase Youdao Confucius4-R2T2 — then translates via a per-user LLM (default gpt-5-nano). Supports 54 languages, two-way/one-way translation modes.

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

Next.js 16.3 (App Router, Turbopack) + React 19 + TypeScript 5 + Tailwind CSS v4 + shadcn/ui (Radix). Soniox stt-rt-v4 or Confucius4-R2T2 for real-time STT. OpenAI / Anthropic models for translation (per-user, configured in admin), GPT for summary. Vercel Edge Config for user database. jose for JWT. Resend for email OTP. Transcript rows are memoized (no virtualization).

## Architecture

### Data Flow

```
Browser AudioWorklet (16kHz PCM16, batched 100 ms / 160 ms frames)
  → WebSocket → Soniox (stt-rt-v4, speaker diarization)      [provider "soniox"]
             or R2T2 ws_server.py /asr_stream_api_v1        [provider "r2t2"]
  ← Soniox tokens / R2T2 incremental text + VAD `reset`
  → useSonioxTranscription hook builds BilingualEntry[]
  → POST /api/translate → LLM translation
  → TranscriptPanel (memoized rows)
```

Audio goes directly from browser to the STT engine — the server never touches audio data. Soniox uses a 10-min ephemeral token; R2T2 uses the static `secret_key` from `/api/r2t2-config` (auth-protected).

### STT engines

- **Soniox** (default): cloud, 60+ languages, speaker diarization + language ID.
- **R2T2** (NetEase Youdao Confucius4-R2T2, Qwen3-ASR based): must be self-hosted on a GPU (vLLM + `ws_server.py` from github.com/netease-youdao/Confucius4-R2T2). Append-only output, Chinese/English optimized, **no speaker diarization or language ID** (language comes from the CJK heuristic). The picker in StatusBar enables it only when `R2T2_WS_URL` + `R2T2_SECRET_KEY` are set. Protocol: first frame JSON header `{requestId, secret_key, language, use_vad, system_prompt}`, then binary 16 kHz int16 PCM, end with the string `YOUDAO_ONETIME_ASR_STREAM_EOS`. Change `secret_key_list` in `ws_server.py` (defaults to a debug key).

### Two-Tier Authentication

**User login** (`/login`): Email OTP → `auth_token` cookie (15-day JWT)
- Whitelist stored in Vercel Edge Config (`auth_users` key)
- OTP: 6-digit, 5-min validity, SHA-256 hashed

**Admin login** (`/admin/login`): Password → `admin_token` + `auth_token` cookies (24h JWT)
- Admin gets both tokens: access to main app + admin panel
- Main page displays "admin" as username

**Middleware** (`middleware.ts`): All routes require `auth_token` except `/login`, `/admin/login`, `/api/auth/*`, `/api/admin/auth`. Admin routes require `admin_token`.

### Core Hook: useSonioxTranscription.ts

Central logic for the entire app:
- AudioWorklet setup (buffers frames in the worklet), linear interpolation resampling for non-16kHz contexts
- WebSocket connection to Soniox or R2T2 (`config.provider`)
- Token processing: splits original vs translation tokens via `translation_status`
- Speaker change detection triggers segment finalization
- Endpoint detection (all tokens final) auto-finalizes segments
- Language detection: CJK character ratio >20% → detected language
- Translation queue (FIFO) for pending entries
- Auto-merge heuristic: short same-language segments adopt previous speaker
- stop() sends end-of-audio and drains trailing results before closing (3 s timeout)

### Key Types (types/bilingual.ts)

- `BilingualEntry`: id, speaker, speakerLabel, language, originalText, translatedText, interimOriginal/Translated, isFinal, startMs, endMs, timestamp
- `SonioxToken`: text, is_final, speaker, start_ms, end_ms, translation_status ("none"|"original"|"translation"), language
- `SonioxConfig`: languageA, languageB, contextTerms, translationMode ("two_way"|"one_way")

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/soniox-token` | POST | 10-min ephemeral Soniox token |
| `/api/r2t2-config` | GET/POST | R2T2 availability / connection details |
| `/api/usage` | POST | Record STT seconds (Soniox only) |
| `/api/translate` | POST | LLM translation (single or multi-target) |
| `/api/summarize` | POST | Meeting summary generation |
| `/api/auth/send-code` | POST | Email OTP |
| `/api/auth/verify-code` | POST | Verify OTP, issue JWT |
| `/api/auth/me` | GET | Current user info (email, name, role) |
| `/api/auth/logout` | POST | Clear cookies |
| `/api/admin/auth` | POST | Admin password login |
| `/api/admin/users` | GET/POST/DELETE | User CRUD |

### Component Hierarchy

```
<Home> (app/page.tsx)
├── <StatusBar>              # Top: recording state, timer, user info, admin link
├── <Sidebar>                # Left: language, mode, speaker, terms, record/export
│   ├── <AudioWaveButton>    # Record/stop with waveform
│   ├── <TranslationModeToggle>
│   ├── <BetweenLanguages> / <FromToLanguages>
│   ├── <TermsPanel>         # Context terms with preset categories
│   └── <SpeakerPanel>       # Speaker rename + word count
├── <MobileSidebarDrawer>    # Mobile sheet wrapper
└── <TranscriptPanel>        # Virtual list, 25-color speaker palette
```

## Environment Variables

```bash
SONIOX_API_KEY=...           # Soniox STT API key
OPENAI_API_KEY=sk-...        # GPT translations & summaries
ANTHROPIC_API_KEY=...        # Claude translation models (optional)
R2T2_WS_URL=wss://.../asr_stream_api_v1  # Self-hosted R2T2 (optional)
R2T2_SECRET_KEY=...          # Must match secret_key_list in ws_server.py
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
