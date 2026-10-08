// Speech engine connection through the mobile app's native layer
// (mobile/: Capacitor shell, plugin "NativeStt", Swift + Kotlin).
//
// In the app, the microphone and the WebSocket to the speech engine live in
// native code, so recording continues with the screen locked or another app
// in front — a web page's microphone and JavaScript are suspended there.
// Native numbers every engine message; while the page is suspended it
// keeps them, and the page catches up when it runs again (drain).
//
// NativeSocket looks like the WebSocket the hook uses, so the hook's
// message handling, translation and saving are the same in the app and in
// a browser.

interface PluginListener {
  remove: () => Promise<void> | void;
}

interface NativeSttPlugin {
  start(options: {
    url: string;
    openMessage: string;
    sampleRate: number;
    frameMs: number;
    audioProcessing: boolean;
    notificationTitle: string;
    notificationText: string;
    // Sent when no audio has gone out for a few seconds (a phone call took
    // the microphone), so the engine doesn't close the session
    keepaliveMessage?: string;
    // iOS: "broadcast" captures what the phone plays (meeting apps, WeChat)
    // plus the microphone, through the ReplayKit extension; the system asks
    // the user to start it
    source?: "mic" | "broadcast";
  }): Promise<void>;
  // Stop the microphone, send end-of-audio (empty binary frame, or `text`),
  // and close once the engine closes (or after a few seconds)
  finish(options: { text?: string }): Promise<void>;
  cancel(): Promise<void>;
  drain(options: { after: number }): Promise<{ messages: { seq: number; data: string }[] }>;
  addListener(event: "message", fn: (e: { seq: number; data: string }) => void): Promise<PluginListener>;
  addListener(event: "closed", fn: (e: { code: number; reason: string }) => void): Promise<PluginListener>;
  addListener(event: "error", fn: (e: { message: string }) => void): Promise<PluginListener>;
  addListener(event: "progress", fn: (e: { samples: number }) => void): Promise<PluginListener>;
  // iOS floating captions (PiP; builds from 2026-10): native builds the
  // captions from the engine's messages and translates them itself, since
  // the page is suspended in the background. Older builds lack these.
  pipConfigure?(options: PipConfig): Promise<{ supported: boolean }>;
  pipStart?(): Promise<{ started: boolean }>;
  pipStop?(): Promise<void>;
  addListener(event: "pip", fn: (e: { active: boolean }) => void): Promise<PluginListener>;
}

export interface PipConfig {
  mode: string;
  languageA: string[];
  languageB: string;
  // Multilingual: the one translation shown
  displayLang: string;
  terms: string[];
  uiLocale: string;
  translateUrl: string;
  // Shown before the first sentence
  waiting: string;
  // Start PiP when the app leaves the screen while recording
  autoStart: boolean;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: { NativeStt?: NativeSttPlugin };
}

// The plugin, when this page runs inside the mobile app. (iOS builds before
// the SceneDelegate fix never registered it: those keep the web microphone.)
export function nativeStt(): NativeSttPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.NativeStt ?? null;
}

// Capturing other apps' audio (ReplayKit broadcast) exists in the iOS app only
export function broadcastAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return nativeStt() !== null && cap?.getPlatform?.() === "ios";
}

export function isNativeApp(): boolean {
  return nativeStt() !== null;
}

// What the hook needs of a WebSocket
export interface SocketLike {
  readonly readyState: number;
  binaryType: BinaryType;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  send(data: string | ArrayBuffer): void;
  close(): void;
}

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

export class NativeSocket implements SocketLike {
  readyState = CONNECTING;
  binaryType: BinaryType = "arraybuffer";
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  // Audio samples native has sent (for the transcript timeline)
  samplesSent = 0;
  // Why start failed (microphone permission, network), for the banner
  errorMessage: string | null = null;

  private lastSeq = 0;
  private draining = false;
  private listeners: PluginListener[] = [];
  private onVisible = () => {
    if (document.visibilityState === "visible") void this.catchUp();
  };

  constructor(
    private plugin: NativeSttPlugin,
    private options: Parameters<NativeSttPlugin["start"]>[0],
    private onProgress?: (samples: number) => void
  ) {
    void this.open();
  }

  private async open() {
    try {
      this.listeners = await Promise.all([
        this.plugin.addListener("message", (e) => this.receive(e.seq, e.data)),
        this.plugin.addListener("progress", (e) => {
          this.samplesSent = e.samples;
          this.onProgress?.(e.samples);
        }),
        this.plugin.addListener("error", () => this.onerror?.(new Event("error"))),
        this.plugin.addListener("closed", (e) => void this.closed(e.code, e.reason)),
      ]);
      document.addEventListener("visibilitychange", this.onVisible);
      await this.plugin.start(this.options);
      if (this.readyState !== CONNECTING) return; // cancelled meanwhile
      this.readyState = OPEN;
      this.onopen?.(new Event("open"));
    } catch (error) {
      console.error("[native] start failed:", error);
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.readyState = CLOSED;
      this.cleanup();
      this.onerror?.(new Event("error"));
    }
  }

  // In order, once each; a gap means messages arrived while the page was
  // suspended — fetch them from native first
  private receive(seq: number, data: string) {
    if (seq <= this.lastSeq) return;
    if (seq > this.lastSeq + 1) {
      void this.catchUp();
      return;
    }
    this.lastSeq = seq;
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  private async catchUp() {
    if (this.draining) return;
    this.draining = true;
    try {
      const { messages } = await this.plugin.drain({ after: this.lastSeq });
      for (const m of messages.sort((a, b) => a.seq - b.seq)) {
        if (m.seq !== this.lastSeq + 1) continue;
        this.lastSeq = m.seq;
        this.onmessage?.(new MessageEvent("message", { data: m.data }));
      }
    } catch (error) {
      console.error("[native] drain failed:", error);
    } finally {
      this.draining = false;
    }
  }

  private async closed(code: number, reason: string) {
    if (this.readyState === CLOSED) return;
    // Whatever arrived before the close first
    await this.catchUp();
    this.readyState = CLOSED;
    this.cleanup();
    this.onclose?.(new CloseEvent("close", { code, reason }));
  }

  private cleanup() {
    document.removeEventListener("visibilitychange", this.onVisible);
    for (const l of this.listeners) void l.remove();
    this.listeners = [];
  }

  // The hook sends audio only through its own microphone path, which isn't
  // used in the app; what reaches here is the end-of-audio signal
  send(data: string | ArrayBuffer) {
    if (this.readyState !== OPEN) return;
    if (typeof data === "string") {
      this.readyState = CLOSING;
      void this.plugin.finish({ text: data });
    } else if (data.byteLength === 0) {
      this.readyState = CLOSING;
      void this.plugin.finish({});
    }
  }

  close() {
    if (this.readyState === CLOSED) return;
    const wasConnecting = this.readyState === CONNECTING;
    this.readyState = CLOSED;
    void this.plugin.cancel();
    this.cleanup();
    if (!wasConnecting) this.onclose?.(new CloseEvent("close", { code: 1000 }));
  }
}
