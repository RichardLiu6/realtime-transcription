# DONE

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
