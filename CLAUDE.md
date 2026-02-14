# 实时语音转文字 + 三语翻译

## 项目概述

Web 端实时语音转文字工具，面向会议场景。浏览器端 VAD 自动断句 → Whisper 转录 → GPT-4o-mini 翻译，每段语音同时显示中/英/西三语。支持发言人标记、SSE 流式显示、AI 会议摘要、多格式导出。

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
| 前端 VAD | @ricky0123/vad-react + vad-web (Silero VAD) | 0.0.36 / 0.0.30 |
| 虚拟列表 | react-window v2 | 2.2.7 |
| 转录 | OpenAI Whisper API (`whisper-1`, `verbose_json`) | - |
| 翻译 | OpenAI GPT-4o-mini (单次 JSON 模式) | - |
| 部署 | Vercel | - |

---

## 目录结构

```
realtime-transcription/
├── app/
│   ├── layout.tsx                # 根布局 (lang="zh", Geist 字体)
│   ├── page.tsx                  # 主页面: 会议模式 UI + 发言人选择 + 导出 + 摘要
│   ├── globals.css               # Tailwind v4 + 自定义滚动条/动画
│   └── api/
│       ├── transcribe/route.ts   # SSE 流式: Whisper 转录 + GPT-4o-mini 翻译
│       └── summarize/route.ts    # GPT-4o-mini 会议摘要生成
├── components/
│   └── TranscriptDisplay.tsx     # 虚拟列表 (react-window) + 三语显示 + 发言人标签
├── hooks/
│   └── useVADTranscription.ts    # 核心 hook: VAD + WAV + SSE 流读取 + AbortController
├── lib/
│   └── openai.ts                 # OpenAI client (启动时校验 API key)
├── types/
│   ├── index.ts                  # TranscriptEntry, TranslationSet 类型
│   └── languages.ts              # 共享语言配置 (ALL_LANGS, LANG_NAMES, LANG_LABELS, LANG_BADGES)
├── public/
│   ├── silero_vad_v5.onnx        # VAD 模型 (必须)
│   ├── silero_vad_legacy.onnx    # VAD 备用模型
│   ├── vad.worklet.bundle.min.js # VAD worklet (必须)
│   └── ort-wasm-simd-threaded.*  # ONNX Runtime WASM + MJS 文件 (必须)
├── next.config.ts                # Turbopack + COOP/COEP headers
└── .env.local                    # OPENAI_API_KEY
```

---

## 数据流

```
麦克风 → VAD(Silero) 自动断句
  → 客户端过滤(RMS能量 ≥ 0.01, 时长 ≥ 500ms)
  → Float32Array → WAV Blob(16kHz, 16bit PCM)
  → POST /api/transcribe (FormData) → 限流检查(30次/分/IP) + 文件大小校验(≤10MB)
  → SSE 流式响应:
    1. event:transcription → {text, language} (立即显示)
    2. event:translation → {translations: {zh, en, es}} (翻译完成后更新)
  → 前端流式追加/更新 transcript 列表
  → react-window 虚拟列表渲染 + 三语并排显示 + 发言人标签
```

---

## 核心逻辑

### VAD 参数 (hooks/useVADTranscription.ts)

```
positiveSpeechThreshold: 0.7   // 语音检测阈值(高=严格,减少误触)
negativeSpeechThreshold: 0.45  // 静音检测阈值
redemptionMs: 500              // 停顿多久算说完
minSpeechMs: 250               // 最短有效语音
baseAssetPath: "/"             // 必须显式设置,否则指向 /_next/static/
onnxWASMBasePath: "/"          // 同上
```

### 多层噪音过滤

1. **VAD 层**: 高阈值减少误触发
2. **客户端**: RMS 能量 < 0.01 丢弃, 时长 < 500ms 丢弃
3. **服务端**: 文本 < 2 字符返回空, 检测语言不在 {zh,en,es} 返回空

### 安全保护

- **IP 限流**: 滑动窗口 30 次/分钟/IP, 超限返回 429
- **文件大小**: 音频 > 10MB 拒绝
- **API Key**: 启动时校验 OPENAI_API_KEY 存在
- **AbortController**: 停止录音时取消所有待处理请求

### 并行处理 + 流式显示

- **并行火即忘**: 每段语音独立 `processAudio()`, 无串行队列, 大幅降低延迟
- **2路并行翻译**: 服务端对非源语言各起一个 GPT-4o-mini plain text 翻译 (比 JSON 模式更快)
- SSE 流读取: `response.body.getReader()` 逐块解析 `event:` 和 `data:` 字段
- 处理计数器 (非布尔值) 避免 isProcessing 闪烁
- 5xx 自动重试 1 次 (1秒延迟)
- **显示策略**: 原文优先展示 (可能混合语言), 三语翻译以小号文字附在下方

---

## UI 设计

- **会议模式**: 固定视窗 (`h-screen`), 不会无限拉长
- **一键开始**: 点击状态指示灯开始/暂停录音
- **发言人选择**: 头部芯片按钮切换当前发言人 (4人 + 无)
- **虚拟列表**: react-window 只渲染可见行, 支持上千条记录
- **智能滚动**: 用户在底部时自动跟随, 滚动查看历史时停止
- **跳到最新**: 向上滚动后出现 "最新" 按钮一键回到底部
- **三语并排**: 中(蓝)/EN(绿)/ES(橙) 三行, 原语言加粗, 发言人彩色标签
- **流式显示**: 转录文本立即展示, 翻译异步更新
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
| VAD 加载失败 "no available backend" | public/ 缺少 .mjs 文件 | 从 node_modules/onnxruntime-web/dist/ 复制所有 ort-wasm-simd-threaded.* 到 public/ |
| VAD 模型路径错误 | asset-path.js 从 currentScript.src 推导路径 | 显式设置 `baseAssetPath: "/"` 和 `onnxWASMBasePath: "/"` |
| 静音时误识别为随机语言 | Whisper 对噪音产生幻觉 | 多层过滤: VAD 高阈值 + RMS/时长检查 + 语言白名单 |
| Next.js 16 Turbopack 报错 | 有 webpack config 但缺少 turbopack config | next.config.ts 加 `turbopack: {}` |
| SharedArrayBuffer 不可用 | 需要 Cross-Origin Isolation | next.config.ts 添加 COOP/COEP headers |
| isProcessing 闪烁 | 布尔值在并发请求间切换 | 改用计数器: processingCount > 0 |
| beforeunload 不可靠 | 现代浏览器限制 | 改为显式导出按钮 + localStorage 备份 |
| Serverless 限流有限 | 内存不跨实例共享 | 当前够用; 生产可升级 Upstash Redis |

---

## 开发命令

```bash
npm run dev     # 本地开发 (localhost:3000)
npm run build   # 生产构建
npm run start   # 生产启动
```

## 成本估算

- Whisper: $0.006/分钟
- GPT-4o-mini 翻译: 约 $0.0005/段 (单次 JSON 调用, 之前是2次)
- 1小时会议: 约 $0.40
- 8小时/天: 约 $3.2/天
