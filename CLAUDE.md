# 实时语音转文字 + 三语翻译

## 项目概述

Web 端实时语音转文字工具，面向会议场景。Deepgram Nova-3 实时流式转录 + 自动说话人识别 → GPT-4o-mini 翻译，每段语音同时显示中/英/西三语。支持主要语言选择、段落自动合并、AI 会议摘要（含历史）、多格式导出。

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
| 实时转录 | Deepgram Nova-3 (WebSocket 流式) | REST + WSS |
| 说话人识别 | Deepgram Diarization (diarize=true) | - |
| 虚拟列表 | react-window v2 | 2.2.7 |
| 翻译 | OpenAI GPT-4o-mini (2路并行 plain text) | - |
| 摘要 | OpenAI GPT-4o-mini | - |
| 部署 | Vercel (Git 集成自动部署) | - |

---

## 目录结构

```
realtime-transcription/
├── app/
│   ├── layout.tsx                # 根布局 (lang="zh", Geist 字体)
│   ├── page.tsx                  # 主页面: 语言选择器 + 摘要历史 + 导出
│   ├── globals.css               # Tailwind v4 + 自定义滚动条/动画
│   └── api/
│       ├── deepgram-token/route.ts  # 生成 Deepgram 临时 JWT (TTL 10min)
│       ├── translate/route.ts       # GPT-4o-mini 2路并行翻译
│       └── summarize/route.ts       # GPT-4o-mini 会议摘要生成
├── components/
│   └── TranscriptDisplay.tsx     # 虚拟列表 (react-window) + 段落显示 + 说话人标签
├── hooks/
│   └── useDeepgramTranscription.ts  # 核心 hook: WebSocket + MediaRecorder + 段落管理 + 翻译触发
├── lib/
│   └── openai.ts                 # OpenAI client (启动时校验 API key)
├── types/
│   ├── index.ts                  # Paragraph, TranslationSet 类型
│   └── languages.ts              # 共享语言配置 (ALL_LANGS, LANG_NAMES, LANG_LABELS, LANG_BADGES)
├── public/
│   └── (仅 Next.js 默认 SVG 图标)
└── next.config.ts                # Turbopack 配置
```

---

## 数据流

```
麦克风 → MediaRecorder (250ms chunks)
  → WebSocket 直连 Deepgram (wss://api.deepgram.com/v1/listen)
    参数: model=nova-3, diarize=true, interim_results=true,
          utterance_end_ms=1500, vad_events=true, endpointing=500,
          smart_format=true, language=用户选择
  → 实时收到:
    - interim (is_final=false): 实时更新当前段落显示文字
    - final (is_final=true): 追加到当前段落, 检查说话人变化
    - speech_final: 段落结束, 触发翻译
    - UtteranceEnd: 长停顿, 强制段落结束
  → 段落合并逻辑: 同一说话人+连续语音=同段, 换人/长停顿=新段
  → 段落完成后 → POST /api/translate → GPT-4o-mini 2路并行翻译
  → react-window 虚拟列表渲染 + 原文大号 + 三语翻译小号
```

---

## 核心逻辑

### Deepgram WebSocket 参数

```
model: nova-3              # 最新最准模型
language: 用户选择          # zh/en/es/multi
smart_format: true         # 自动标点、大写
diarize: true              # 说话人识别
interim_results: true      # 实时中间结果
utterance_end_ms: 1500     # 1.5秒静音=段落结束
vad_events: true           # 语音活动检测事件
endpointing: 500           # 500ms 端点检测
```

### 段落管理策略

- **追加模式**: 同一说话人的连续 final results 追加到同一段落
- **分段条件**: 说话人变化 或 UtteranceEnd 事件 或 speech_final
- **翻译时机**: 段落结束后统一翻译（省钱、翻译质量更好）
- **显示策略**: 原文大号显示（可能混合语言），三语翻译小号附在下方
- **中间结果**: interim text 实时更新，带闪烁光标效果

### 安全保护

- **临时密钥**: 服务端生成 Deepgram JWT (TTL 10分钟), 浏览器直连, API key 不暴露
- **API Key**: 启动时校验 OPENAI_API_KEY 和 DEEPGRAM_API_KEY
- **localStorage**: 段落备份 (500ms 防抖)

### 摘要历史

- 生成的摘要存 localStorage，最多保留 20 条
- 点击"摘要": 有历史→直接打开最近一条; 无历史→自动生成
- 弹窗支持翻页浏览历史 + "重新生成"按钮
- prompt 更灵活，不再强制三段式格式

---

## UI 设计

- **会议模式**: 固定视窗 (`h-screen`), 不会无限拉长
- **一键开始**: 点击状态指示灯开始/暂停
- **语言选择**: 头部芯片按钮选择主要语言 (中/EN/ES/多语), 录音中不可切换
- **虚拟列表**: react-window 只渲染可见行, 支持大量段落
- **智能滚动**: 用户在底部时自动跟随, 滚动查看历史时停止
- **跳到最新**: 向上滚动后出现 "最新" 按钮
- **段落显示**: 原文大号 + 三语翻译小号, 说话人自动彩色标签
- **实时打字**: interim 结果实时显示, 带闪烁光标
- **翻译动画**: 段落翻译中显示 "翻译中..." 指示
- **多格式导出**: TXT / SRT / VTT 下拉选择
- **AI 摘要**: 支持历史浏览 + 重新生成
- **无障碍**: role="log", aria-live="polite", aria-label

---

## 环境变量

```bash
# .env.local (Vercel 上也需配置)
DEEPGRAM_API_KEY=xxx      # Deepgram API key (nova-3 转录 + 说话人识别)
OPENAI_API_KEY=sk-xxx     # OpenAI API key (GPT-4o-mini 翻译 + 摘要)
```

---

## 开发命令

```bash
npm run dev     # 本地开发 (localhost:3000)
npm run build   # 生产构建
npm run start   # 生产启动
```

## 成本估算

- Deepgram Nova-3 实时转录: $0.0059/分钟 (含 diarization)
- GPT-4o-mini 翻译: 约 $0.0005/段 (2路并行)
- GPT-4o-mini 摘要: 约 $0.002/次
- 1小时会议: 约 $0.40
