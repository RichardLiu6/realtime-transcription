// Records the scripted meeting (meeting.mjs) on a running build: multilingual
// mode (中文 / English / Español), mocked speech engine and translation API,
// so every run shows the same meeting — a reference to compare updates by.
//
//   JWT_SECRET=<the server's> node scripts/demo/record.mjs <baseUrl> <out.webm>
//
// scripts/demo/compare.sh records main and the working tree side by side.
import { createRequire } from "module";
import { mkdtempSync, readdirSync, renameSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { SignJWT } from "jose";
import { LINES, SPEAKERS, units } from "./meeting.mjs";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("/opt/node22/lib/node_modules/playwright"));
}

const [base, out] = process.argv.slice(2);
if (!base || !out) {
  console.error("usage: node scripts/demo/record.mjs <baseUrl> <out.webm>");
  process.exit(2);
}
const SIZE = { width: 1440, height: 900 };
const STEP_MS = 280; // one speech unit (two characters / one word)
const PAUSE_MS = 250; // between sentences
const TRANSLATE_MS = 700; // mock model latency

const token = await new SignJWT({ email: "demo@example.com", name: "Demo" })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(process.env.JWT_SECRET || "testsecret"));

// Translation of a sentence, or of its beginning (provisional calls):
// the same share of each target's text
function translate(text, lang) {
  const clean = text.trim();
  for (const [, source, tr] of LINES) {
    const original = tr[source];
    if (!original.startsWith(clean)) continue;
    if (lang === source) return clean;
    const share = clean.length / original.length;
    return share >= 1 ? tr[lang] : tr[lang].slice(0, Math.max(1, Math.round(tr[lang].length * share))) + "…";
  }
  return clean;
}

const videoDir = mkdtempSync(join(tmpdir(), "demo-video-"));
const browser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const context = await browser.newContext({
  viewport: SIZE,
  locale: "zh-CN",
  recordVideo: { dir: videoDir, size: SIZE },
});
await context.addCookies([{ name: "auth_token", value: token, url: base }]);
await context.grantPermissions(["microphone"]);
await context.addInitScript(() => {
  const set = (k, v) => localStorage.getItem(k) === null && localStorage.setItem(k, v);
  set("translationMode", '"presentation"');
  set("targetLangs", '["zh","en","es"]');
  set("uiLocale", '"zh"');
});
const page = await context.newPage();
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.route("**/api/auth/me", (r) => r.fulfill({ json: { user: { email: "demo@example.com", name: "Demo", role: "user" } } }));
await page.route("**/api/soniox-token", (r) => r.fulfill({ json: { api_key: "demo" } }));
await page.route("**/api/usage", (r) => r.fulfill({ json: { ok: true } }));
await page.route("**/api/meetings**", (r) => r.fulfill({ status: 503, json: { error: "demo" } }));
await page.route("**/api/translate", async (r) => {
  const b = r.request().postDataJSON();
  await new Promise((res) => setTimeout(res, TRANSLATE_MS));
  const targets = b.targetLangs ?? [b.targetLang];
  const translations = Object.fromEntries(targets.map((l) => [l, translate(b.text, l)]));
  await r.fulfill({ json: b.targetLangs ? { translations } : { translatedText: translations[b.targetLang] } });
});

// Speech engine: the meeting, as Soniox sends it — the sentence growing as
// non-final tokens, then all of it final (an endpoint)
let finished;
const done = new Promise((res) => (finished = res));
await page.routeWebSocket(/soniox\.com/, (ws) => {
  let started = false;
  ws.onMessage(async (m) => {
    if (typeof m === "string" || started) return;
    started = true;
    let t = 0;
    for (const [who, lang, tr] of LINES) {
      const parts = units(tr[lang], lang);
      const tokens = parts.map((text) => {
        t += STEP_MS;
        return { text, speaker: SPEAKERS[who], language: lang, start_ms: t - STEP_MS, end_ms: t, translation_status: "none" };
      });
      for (let i = 1; i <= tokens.length; i++) {
        ws.send(JSON.stringify({ tokens: tokens.slice(0, i).map((x) => ({ ...x, is_final: false })) }));
        await new Promise((res) => setTimeout(res, STEP_MS));
      }
      ws.send(JSON.stringify({ tokens: tokens.map((x) => ({ ...x, is_final: true })) }));
      t += PAUSE_MS;
      await new Promise((res) => setTimeout(res, PAUSE_MS));
    }
    finished();
  });
});

await page.goto(base + "/");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /开始录音/ }).first().click();

// Midway someone scrolls up to reread, then returns to the latest
await page.waitForTimeout(32000);
const log = page.locator("main [role=log]");
await log.evaluate((el) => el.scrollBy({ top: -350, behavior: "smooth" }));
await page.waitForTimeout(7000);
await page.getByRole("button", { name: /滚动到最新/ }).first().click().catch(() => {});

await done;
await page.waitForTimeout(3000);
const video = page.video();
await context.close();
await browser.close();
renameSync(await video.path(), out);
for (const f of readdirSync(videoDir)) rmSync(join(videoDir, f));
rmSync(videoDir, { recursive: true });
console.log("recorded", out);
