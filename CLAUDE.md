# 实时语音转文字 + 三语翻译

## 项目概述

Web 端实时语音转文字工具，面向会议场景。浏览器通过 OpenAI Realtime WebSocket API 直连 gpt-4o-transcribe，实现真正的实时流式转录（边说边出字）。转录完成后调用 GPT-4o-mini 翻译，每段语音同时显示中/英/西三语。支持发言人标记、实时流式显示、AI 会议摘要、多格式导出。

- **线上地址**: https://realtime-transcription-murex.vercel.app
- **GitHub**: https://github.com/RichardLiu6/realtime-transcription
- **Vercel 项目**: richardliu130-gmailcoms-projects/realtime-transcription
- **Team ID**: team_HWMvB1FZI23r6nQWdyOmdVw1 | **Project ID**: prj_SXHbgT9CGqpRXVhupy3Ve93AMhTW

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router, Turbopack) | 16.1.6 |
| 前端 | React + TypeScript | 19.2.3 |
| 样式 | Tailwind CSS v4 | ^4 |
| 音频采集 | AudioWorklet (24kHz mono PCM16) | Web API |
| 实时转录 | OpenAI Realtime WebSocket API + gpt-4o-transcribe | - |
| 翻译 | OpenAI GPT-4o-mini | - |
| 虚拟列表 | react-window v2 | 2.2.7 |
| 部署 | Vercel | - |

---

## 目录结构

```
realtime-transcription/
├── app/
│   ├── layout.tsx                  # 根布局 (lang="zh", Geist 字体)
│   ├── page.tsx                    # 主页面: 会议模式 UI + 发言人选择 + 导出 + 摘要
│   ├── globals.css                 # Tailwind v4 + 自定义滚动条/动画/闪烁光标
│   └── api/
│       ├── realtime-token/route.ts # 生成 ephemeral token (浏览器直连 OpenAI WebSocket)
│       ├── translate/route.ts      # GPT-4o-mini 2路并行翻译
│       └── summarize/route.ts      # GPT-4o-mini 会议摘要生成
├── components/
│   └── TranscriptDisplay.tsx       # 虚拟列表 + 三语显示 + 实时interim文字 + 发言人标签
├── hooks/
│   └── useRealtimeTranscription.ts # 核心 hook: WebSocket + AudioWorklet + 翻译 + 重连
├── lib/
│   └── openai.ts                   # OpenAI client (启动时校验 API key)
├── types/
│   ├── index.ts                    # TranscriptEntry (含 interimText), TranslationSet
│   └── languages.ts                # 共享语言配置 (ALL_LANGS, LANG_NAMES, LANG_LABELS, LANG_BADGES)
├── next.config.ts                  # Turbopack
└── .env.local                      # OPENAI_API_KEY
```

---

## 数据流

```
浏览器 AudioWorklet (24kHz PCM16)
  → WebSocket 直连 OpenAI (wss://api.openai.com/v1/realtime?intent=transcription)
    (用 ephemeral token 认证, API key 不暴露)
  ← transcription.delta: 实时部分文字 (边说边出, interimText)
  ← transcription.completed: 完整句子 (finalText)
    → POST /api/translate → GPT-4o-mini 2路并行翻译
    ← { translations: {zh, en, es} }
  → react-window 虚拟列表渲染 + 三语并排显示 + 发言人标签
```

---

## 核心逻辑

### Realtime WebSocket (hooks/useRealtimeTranscription.ts)

1. **获取临时密钥**: POST /api/realtime-token → ephemeral token (10分钟有效)
2. **音频采集**: getUserMedia + AudioWorklet 获取 24kHz mono PCM16
3. **WebSocket 连接**: 直连 OpenAI，发送 `input_audio_buffer.append` (base64 PCM)
4. **转录事件处理**:
   - `conversation.item.input_audio_transcription.delta` → 更新 interimText (实时显示)
   - `conversation.item.input_audio_transcription.completed` → 最终文本，触发翻译
5. **断线重连**: WebSocket 断开时自动重新获取 token 并重连 (最多5次)

### Server VAD 参数 (realtime-token/route.ts)

```
type: "server_vad"
silence_duration_ms: 500    // 静音多久算说完
threshold: 0.5              // 语音检测阈值
prefix_padding_ms: 300      // 保留语音前的音频
noise_reduction: "near_field" // 近场降噪
```

### 语言检测

- 基于文本内容的 CJK 字符检测 (>20% CJK → 中文, 含 áéíóú 等 → 西班牙语, 默认英语)
- 不依赖 API 返回的 language 字段

### 安全保护

- **API Key 不暴露**: 通过 ephemeral token 认证，浏览器不接触真实 API key
- **Token 有效期**: 10 分钟，过期需重新获取
- **API Key 校验**: 启动时校验 OPENAI_API_KEY 存在

---

## UI 设计

- **会议模式**: 固定视窗 (`h-screen`), 不会无限拉长
- **一键开始**: 点击状态指示灯开始/暂停录音
- **发言人选择**: 头部芯片按钮切换当前发言人 (4人 + 无)
- **虚拟列表**: react-window 只渲染可见行, 支持上千条记录
- **智能滚动**: 用户在底部时自动跟随, 滚动查看历史时停止
- **跳到最新**: 向上滚动后出现 "最新" 按钮一键回到底部
- **三语并排**: 中(蓝)/EN(绿)/ES(橙) 三行, 原语言加粗, 发言人彩色标签
- **实时流式**: interim 文字灰色 + 闪烁光标, 最终文字黑色加粗
- **多格式导出**: TXT / SRT / VTT 下拉选择
- **AI 摘要**: 一键生成会议摘要 (要点/决定/行动项), 模态框显示
- **无障碍**: role="log", aria-live="polite", aria-label
- **localStorage**: 防崩溃备份 (500ms 防抖)

---

## 环境变量

```bash
# .env.local (Vercel 上也需配置)
OPENAI_API_KEY=sk-xxx
```

---

## 已知坑与解决方案

| 问题 | 原因 | 解决 |
|------|------|------|
| WebSocket 连接断开 | 网络不稳定或 token 过期 | 自动重连机制 (最多5次, 2秒间隔) |
| AudioContext sampleRate 不是 24kHz | 浏览器硬件限制 | 内置线性插值重采样 |
| gpt-4o-transcribe 不返回 language 字段 | json 格式限制 | 基于文本内容的 CJK 字符检测 |
| Next.js 16 Turbopack 报错 | 有 webpack config 但缺少 turbopack config | next.config.ts 加 `turbopack: {}` |

---

## 开发命令

```bash
npm run dev     # 本地开发 (localhost:3000)
npm run build   # 生产构建
npm run start   # 生产启动
```

## 成本估算

- gpt-4o-transcribe: $0.006/分钟 (与 whisper-1 同价, WER 8.9% vs 10.6%)
- GPT-4o-mini 翻译: 约 $0.0005/段
- 1小时会议: 约 $0.40
- 8小时/天: 约 $3.2/天
