# DONE

## [2026-11-06] 个人 API 令牌 + CLI：/settings/api 生成/吊销令牌（只读、存哈希、1 年过期、每人 10 个）；/api/v1/meetings 列表和单个会议（JSON / Markdown / 文本）；命令行 /abl.mjs（list / get / export）；「复制给 AI 的说明」按钮 + 公开 /llms.txt，让 Claude Code / Codex 等 agent 直接读会议记录

## [2026-11-06] AI 生成限次数不限存储：术语每天 10 次（原 20），自己的术语包最多 50 个（原 3 个）；主题生成每天 40 次，最近主题 8 个

## [2026-11-05] 主题优先：侧栏「会议主题」区块，术语折叠为其详细设置；主题在准备卡片 / 录音时转录区顶部 / 会议页显示；最近主题从账户的会议记录同步；修复英文翻译模式按钮挤在一起

## [2026-11-05] 会议主题：可点选（术语包主题 / 最近用过）、输入或 AI 根据几句话生成；每个术语包带主题；主题发给 Soniox 和翻译；会议记录根据开头几分钟自动起标题（可重命名，重命名优先）

## [2026-11-03] Soniox 上下文：选中术语包的名称作为会议主题（context.general），术语按 8000 token / 9000 字符上限截断（超限会导致录音连不上）

## [2026-10-29] 大段连续讲话翻译不显示：多语言每种语言只给 200 token 被截断（线上日志 out=400/600）→ 按原文长度给额度、截断也显示已翻部分；Soniox 长段在 40 字/词后的句末自动分句

## [2026-10-07] iOS TestFlight 上架（内部测试）
- App Store Connect「ABL Translate」(app id 6820208548)，内部组 ABL Internal；上传脚本 mobile/scripts/ios-testflight.sh

## [2026-10-07] 顶部安全区适配（刘海/状态栏）— PR #18

## [2026-10-07] iOS「手机声音 + 麦克风」收音（ReplayKit broadcast 扩展 + App Group）— PR #18，待真机验证（TODO #5）

## [2026-10-07] 手机新界面 + 术语改版 + AI 生成术语 + 多语言术语翻译修复 — PR #19
- 设计页 https://claude.ai/artifact/EY7657qA3wR8AnWxpHTvc6；细节 docs/mobile-redesign.md

## [2026-10-07] 手机侧边栏手势 + Claude 风格；会议记录改为 App 内组件（记录/纪要标签）— PR #20

## [2026-10-07] App 内会议录音播放修复（播放器不带 Cookie → 先取签名地址）+ 手机播放条 — PR #21

## [2026-10-07] iPhone 播不了电脑录的 WebM：新录音改 MP4/AAC，旧 WebM 首次在 iPhone 播放时服务器用 ffmpeg 转 AAC 副本 — PR #22 #23
- 根因：iOS（Safari 和 App）加载 Chrome MediaRecorder 的 WebM 报 error code=2；AAC 正常。ffmpeg 输入按不可信处理（只按 WebM 解析、只读单文件、4 分钟超时、每人每天 30 次转换）
