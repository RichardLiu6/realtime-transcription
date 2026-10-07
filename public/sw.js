// Service worker for the installable app. It caches nothing — every page
// and API call goes to the network as before, so there's never a stale
// version or a stale login. It only answers page loads that fail because
// the device is offline, with a short message instead of the browser's
// error page.

const OFFLINE_HTML = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ABL Translate</title>
<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;color:#111827;text-align:center;padding:16px}
button{margin-top:16px;padding:8px 16px;border-radius:6px;border:1px solid #d1d5db;background:#fff;font-size:15px}</style></head>
<body><div><p>网络已断开，连上网后重试。</p><p>You're offline. Reconnect and try again.</p>
<button onclick="location.reload()">重试 / Retry</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })
    )
  );
});
