# ABL Translate — iOS / Android app

A [Capacitor](https://capacitorjs.com) shell around the live site
(`https://translate.americanbestlife.com`): web updates reach the app at once,
without a new app version. The native part adds what a web page can't do:
**recording with the screen locked or another app in front**.

- `NativeStt` plugin — microphone + WebSocket to the speech engine in native
  code; the page gets every engine message numbered and catches up after being
  suspended (JS side: `lib/native/stt.ts` in the web app).
  - iOS: `ios/App/App/NativeSttPlugin.swift` (AVAudioEngine, URLSessionWebSocketTask,
    background mode `audio`), registered in `MainViewController.swift`.
  - Android: `android/app/src/main/java/com/americanbestlife/translate/NativeSttPlugin.java`
    (AudioRecord, OkHttp) + `TranscriptionService.java` (foreground service of type
    microphone, ongoing notification) + a partial wake lock.
- In the app the 录音存档 (meeting audio) switch is hidden: the browser recorder
  needs the web microphone. Text is saved as usual.
- Neither platform lets an app record the other side of a phone / WeChat call.

## Builds

GitHub Actions build both on every push to `mobile/**` (or run them by hand
under Actions):

- **Mobile · Android** → artifact `abl-translate-android` (`app-debug.apk`).
- **Mobile · iOS** → compiles for the simulator, unsigned (checks the code).

## Install

**Android**: download the APK from the latest *Mobile · Android* run, send it to
the phone, open it, allow "install unknown apps" when asked.

**iPhone (TestFlight, internal testing — up to 100 people, no App Review)**, on a Mac
with Xcode and the Apple developer account:

1. `cd mobile && npm ci && npx cap sync ios && npx cap open ios`
2. In Xcode: target *App* → Signing & Capabilities → choose the team; check that
   *Background Modes → Audio* is listed (it comes from Info.plist).
3. Product → Archive → Distribute App → TestFlight & App Store → Upload.
4. App Store Connect → the app → TestFlight → add colleagues as internal testers;
   they install the *TestFlight* app and accept the invitation.
5. Builds expire after 90 days: upload a new one before (only the shell; the
   site itself updates without it).

The bundle id is `com.americanbestlife.translate` (`capacitor.config.ts`).

## Changing things

- Site URL / app id: `capacitor.config.ts`, then `npx cap sync`.
- Icons and splash: generated (same design as the web icon) into
  `ios/App/App/Assets.xcassets` and `android/app/src/main/res`.
