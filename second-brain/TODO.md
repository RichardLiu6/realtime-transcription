# TODO

## #1 [2026-10-07] 手机端全新体验（重新设计）— 进行中
- [x] 网页部分：侧边栏 + 一键录音 + 三个模式 + 术语改版 + AI 生成术语（PR #19，2026-10-07 上线）
- [ ] 真机/有内容时的录音页、停止后、导出分享面板验证
- [ ] 原生部分：演示模式隐藏状态栏、悬浮字幕（#6）
- 原则：用户一秒就懂怎么用；按钮太多是问题。功能必须与现有版本一致
- 设计方案与功能对照：[docs/mobile-redesign.md](../docs/mobile-redesign.md)
- 下面 #2–#4 的 App 问题并入新设计一起解决

## #2 [2026-10-07] bug: 演示模式在 iOS App 顶部/底部未适配 — 已修（PR #24 + TestFlight 202610080929），待真机确认
- 状态栏黑字压在深色背景上（需原生隐藏状态栏：@capacitor/status-bar，要发 TestFlight）
- 底部字幕贴着 Home 横条；手机上控制条占 3 行、显示电脑才有的“(Esc)”

## #3 [2026-10-07] bug: App 里“我的会议”/保存状态链接跳到 Safari — 手机布局已修（侧边栏 App 内打开）；iPad 横屏走电脑布局仍会跳
- `target="_blank"`（components/StatusBar.tsx、components/MeetingSaveControls.tsx）→ Capacitor 交给 Safari，Safari 没登录
- 待定：App 内全屏面板（录音不断）vs 同页跳转

## #4 [2026-10-07] bug: App 里导出文件无反应 — 已改分享面板（PR #19），待真机确认
- lib/exportBilingual.ts 用 `<a download>` blob，WKWebView 不支持 → App 内改 iOS 分享面板

## #5 [2026-10-07] 真机验证“手机声音 + 麦克风”（ReplayKit broadcast）
- 2026-10-08 发现：旧构建 SceneDelegate 绕过 MainViewController，NativeStt 从未注册（App 一直用网页麦克风）；修复后构建 202610080929 才真正启用原生录音 / broadcast
- 戴耳机测微信 / Zoom；切回补齐；停止是否正常

## #6 [2026-10-07] 悬浮窗：原生画中画字幕（iOS AVPictureInPicture / Android PiP）
- 后台时网页被挂起 → 原生需自己拼原文并调 /api/translate 补译文
