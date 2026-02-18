# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ABL-translate: Web-based real-time bilingual transcription for meetings. Browser captures audio via AudioWorklet, streams to Soniox WebSocket for STT with speaker diarization, then translates via GPT-4o-mini. Supports 54 languages, two-way/one-way translation modes.

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

Next.js 16 (App Router, Turbopack) + React 19 + TypeScript 5 + Tailwind CSS v4 + shadcn/ui (Radix). Soniox stt-rt-v4 for real-time STT. OpenAI GPT-4o-mini for translation/summary. Vercel Edge Config for user database. jose for JWT. Resend for email OTP. react-window for virtualized transcript list.

## Architecture

### Data Flow

```
Browser AudioWorklet (24kHz PCM16)
  → WebSocket → Soniox (stt-rt-v4, speaker diarization)
  ← tokens (original + translation_status + speaker + language)
  → useSonioxTranscription hook processes tokens into BilingualEntry[]
  → POST /api/translate → GPT-4o-mini parallel translation
  → TranscriptPanel (react-window virtualized list)
```

Audio goes directly from browser to Soniox via ephemeral token — the server never touches audio data.

### Two-Tier Authentication

**User login** (`/login`): Email OTP → `auth_token` cookie (15-day JWT)
- Whitelist stored in Vercel Edge Config (`auth_users` key)
- OTP: 6-digit, 5-min validity, SHA-256 hashed

**Admin login** (`/admin/login`): Password → `admin_token` + `auth_token` cookies (24h JWT)
- Admin gets both tokens: access to main app + admin panel
- Main page displays "admin" as username

**Middleware** (`middleware.ts`): All routes require `auth_token` except `/login`, `/admin/login`, `/api/auth/*`, `/api/admin/auth`. Admin routes require `admin_token`.

### Core Hook: useSonioxTranscription.ts (~720 lines)

Central logic for the entire app:
- AudioWorklet setup with linear interpolation resampling for non-24kHz browsers
- WebSocket connection to `wss://stt-rt.soniox.com/transcribe-websocket`
- Token processing: splits original vs translation tokens via `translation_status`
- Speaker change detection triggers segment finalization
- Endpoint detection (all tokens final) auto-finalizes segments
- Language detection: CJK character ratio >20% → detected language
- Translation queue (FIFO) for pending entries
- Auto-merge heuristic: short same-language segments adopt previous speaker
- Reconnection: max 5 attempts, 2s interval

### Key Types (types/bilingual.ts)

- `BilingualEntry`: id, speaker, speakerLabel, language, originalText, translatedText, interimOriginal/Translated, isFinal, startMs, endMs, timestamp
- `SonioxToken`: text, is_final, speaker, start_ms, end_ms, translation_status ("none"|"original"|"translation"), language
- `SonioxConfig`: languageA, languageB, contextTerms, translationMode ("two_way"|"one_way")

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/soniox-token` | POST | 10-min ephemeral Soniox token |
| `/api/translate` | POST | GPT-4o-mini translation |
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
OPENAI_API_KEY=sk-...        # GPT-4o-mini translations & summaries
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
| WebSocket disconnect | Auto-reconnect (5 max, 2s interval) |
| AudioContext not 24kHz | Linear interpolation resampling in AudioWorklet |
| Next.js 16 Turbopack errors | `turbopack: {}` in next.config.ts |
