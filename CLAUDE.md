# 实时语音转文字 + 三语翻译

## 项目概述

Web 端实时语音转文字工具，面向会议场景。浏览器端 VAD 自动断句 → Whisper 转录 → GPT-4o-mini 翻译，每段语音同时显示中/英/西三语。

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
| 转录 | OpenAI Whisper API (`whisper-1`, `verbose_json`) | - |
| 翻译 | OpenAI GPT-4o-mini | - |
| 部署 | Vercel | - |

---

## 目录结构

```
realtime-transcription/
├── app/
│   ├── layout.tsx                # 根布局 (lang="zh", Geist 字体)
│   ├── page.tsx                  # 主页面: 会议模式 UI + 录音控制 + 自动保存
│   ├── globals.css               # Tailwind v4 + 自定义滚动条/动画
│   └── api/transcribe/route.ts   # Whisper 转录 + GPT-4o-mini 三语翻译
├── components/
│   ├── TranscriptDisplay.tsx     # 核心: 固定高度滚动区 + 三语并排显示
│   ├── RecordButton.tsx          # (未使用) 原始录音按钮
│   └── Toolbar.tsx               # (未使用) 原始工具栏
├── hooks/
│   └── useVADTranscription.ts    # 核心 hook: VAD + WAV 编码 + 请求队列
├── lib/
│   └── openai.ts                 # OpenAI client
├── types/
│   └── index.ts                  # TranscriptEntry, TranslationSet 类型
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
  → POST /api/transcribe (FormData)
  → 服务端过滤(文本 ≥ 2字符, 语言 ∈ {zh,en,es})
  → Whisper 转录 + 检测语言
  → GPT-4o-mini 并行翻译到另外两种语言
  → { text, language, translations: {zh, en, es} }
  → 前端追加到 transcript 列表
  → 三语并排显示(原语言加粗 + 彩色标签)
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

### 请求顺序保证

使用 Promise chain 队列模式 (`requestQueueRef.current = requestQueueRef.current.then(...)`)，确保转录结果按说话顺序显示。

---

## UI 设计

- **会议模式**: 固定视窗 (`h-screen`), 不会无限拉长
- **一键开始**: 点击状态指示灯开始/暂停录音, 无需其他操作
- **智能滚动**: 用户在底部时自动跟随, 滚动查看历史时停止自动滚动
- **跳到最新**: 用户向上滚动后出现 "最新" 按钮一键回到底部
- **三语并排**: 每条记录显示 中(蓝)/EN(绿)/ES(橙) 三行, 原语言加粗高亮
- **自动保存**: localStorage 持续备份, 关闭页面自动下载 .txt

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
| VAD 模型路径错误 | asset-path.js 从 currentScript.src 推导路径, 在 Next.js bundle 中指向 /_next/static/ | 显式设置 `baseAssetPath: "/"` 和 `onnxWASMBasePath: "/"` |
| 静音时误识别为随机语言 | VAD 阈值过低 + Whisper 对噪音产生幻觉 | 多层过滤: VAD 高阈值 + 客户端 RMS/时长检查 + 服务端语言白名单 |
| Next.js 16 Turbopack 报错 | 有 webpack config 但缺少 turbopack config | next.config.ts 加 `turbopack: {}`, 移除 webpack 配置 |
| SharedArrayBuffer 不可用 | 需要 Cross-Origin Isolation | next.config.ts 添加 COOP/COEP headers |
| redemptionFrames 不存在 | @ricky0123/vad-react 使用 `redemptionMs` 而非 `redemptionFrames` | 改用 ms 单位的参数 |

---

## 开发命令

```bash
npm run dev     # 本地开发 (localhost:3000)
npm run build   # 生产构建
npm run start   # 生产启动
```

## 成本估算

- Whisper: $0.006/分钟
- GPT-4o-mini 翻译: 约 $0.001/段 (2次翻译调用)
- 1小时会议: 约 $0.50
- 8小时/天: 约 $4/天
