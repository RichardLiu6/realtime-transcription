#!/usr/bin/env node
// ABL Translate CLI: read your saved meetings with a personal API token
// (create one in the app: user menu → API 令牌 / API tokens). No
// dependencies, Node 18+. Served by the app at /abl.mjs:
//
//   curl -O https://translate.americanbestlife.com/abl.mjs
//
//   export ABL_TOKEN=abl_…                       # the token (required)
//   export ABL_URL=https://translate.americanbestlife.com   # optional
//
//   node abl.mjs meetings list [--q <text>] [--json]
//   node abl.mjs meetings get <id> [--format md|txt|json] [--out <file>]
//   node abl.mjs meetings export [--q <text>] [--format md|txt|json] [--dir <folder>]

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = (process.env.ABL_URL || "https://translate.americanbestlife.com").replace(/\/+$/, "");
const TOKEN = process.env.ABL_TOKEN;

function usage(code = 0) {
  console.log(`Usage:
  abl meetings list [--q <text>] [--json]
  abl meetings get <id> [--format md|txt|json] [--out <file>]
  abl meetings export [--q <text>] [--format md|txt|json] [--dir <folder>]

Environment: ABL_TOKEN (required), ABL_URL (default ${BASE})`);
  process.exit(code);
}

function options(args) {
  const opts = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) opts[key] = true;
      else opts[key] = args[++i];
    } else opts._.push(a);
  }
  return opts;
}

async function api(path) {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      message += `: ${(await res.json()).error}`;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  return res;
}

const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

async function list(opts) {
  const q = typeof opts.q === "string" ? `?q=${encodeURIComponent(opts.q)}` : "";
  const { meetings } = await (await api(`/api/v1/meetings${q}`)).json();
  if (opts.json) return console.log(JSON.stringify(meetings, null, 2));
  for (const m of meetings) {
    const date = m.createdAt.slice(0, 16).replace("T", " ");
    console.log(`${m.id}  ${date}  ${clock(m.durationMs).padStart(6)}  ${String(m.entryCount).padStart(4)}  ${m.title || "(untitled)"}${m.shared ? "  [shared]" : ""}`);
  }
  if (meetings.length === 0) console.error("No meetings.");
}

async function fetchMeeting(id, format) {
  const res = await api(`/api/v1/meetings/${encodeURIComponent(id)}${format === "json" ? "" : `?format=${format}`}`);
  return format === "json" ? JSON.stringify((await res.json()).meeting, null, 2) + "\n" : await res.text();
}

const formatOf = (opts) => {
  const f = typeof opts.format === "string" ? opts.format : "md";
  if (!["md", "txt", "json"].includes(f)) usage(1);
  return f;
};

async function get(opts) {
  const id = opts._[0];
  if (!id) usage(1);
  const body = await fetchMeeting(id, formatOf(opts));
  if (typeof opts.out === "string") {
    await writeFile(opts.out, body);
    console.error(`Wrote ${opts.out}`);
  } else process.stdout.write(body);
}

async function exportAll(opts) {
  const format = formatOf(opts);
  const dir = typeof opts.dir === "string" ? opts.dir : "abl-meetings";
  const q = typeof opts.q === "string" ? `?q=${encodeURIComponent(opts.q)}` : "";
  const { meetings } = await (await api(`/api/v1/meetings${q}`)).json();
  await mkdir(dir, { recursive: true });
  for (const m of meetings) {
    const safe = (m.title || "untitled").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60);
    const file = join(dir, `${m.createdAt.slice(0, 10)}_${safe}_${m.id.slice(0, 6)}.${format}`);
    await writeFile(file, await fetchMeeting(m.id, format));
    console.error(`Wrote ${file}`);
  }
  console.error(`${meetings.length} meeting(s) in ${dir}/`);
}

const [group, command, ...rest] = process.argv.slice(2);
if (!group || group === "help" || group === "--help" || group === "-h") usage(0);
if (!TOKEN) {
  console.error("Set ABL_TOKEN to a personal API token (user menu → API tokens).");
  process.exit(1);
}
if (group !== "meetings") usage(1);
const opts = options(rest);
const run = { list, get, export: exportAll }[command];
if (!run) usage(1);
run(opts).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
