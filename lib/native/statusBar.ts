// The iOS / Android app's status bar (Capacitor StatusBar plugin, in app
// builds that include it): hidden while the projector view is open so the
// captions really fill the screen. A no-op in browsers and older builds.

interface StatusBarPlugin {
  hide(): Promise<void>;
  show(): Promise<void>;
}

function plugin(): StatusBarPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as unknown as {
      Capacitor?: {
        Plugins?: { StatusBar?: StatusBarPlugin };
        nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown>;
      };
    }
  ).Capacitor;
  if (!cap?.Plugins?.StatusBar || !cap.nativePromise) return cap?.Plugins?.StatusBar ?? null;
  const call = cap.nativePromise;
  return {
    hide: () => call("StatusBar", "hide", {}) as Promise<void>,
    show: () => call("StatusBar", "show", {}) as Promise<void>,
  };
}

export function setStatusBarHidden(hidden: boolean): void {
  const sb = plugin();
  if (!sb) return;
  (hidden ? sb.hide() : sb.show()).catch(() => {
    // not available in this build
  });
}
