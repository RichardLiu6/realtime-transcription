import { createClient, type EdgeConfigClient } from "@vercel/edge-config";

export const SUPPORTED_MODELS = [
  "gpt-5-nano",
  "gpt-5-mini",
  "gpt-4o-mini",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  // Qwen-MT translation models via Alibaba Cloud Model Studio (DashScope)
  "qwen-mt-plus",
  "qwen-mt-flash",
  "qwen-mt-lite",
  // Qwen via OpenRouter
  "qwen/qwen3.8-flash",
  "qwen/qwen3.7-plus",
  "qwen/qwen3.7-max",
  "qwen/qwen3.8-max-0902",
] as const;

export type TranslationModel = (typeof SUPPORTED_MODELS)[number];
export const QWEN_MT_DEFAULT_MODEL: TranslationModel = "qwen-mt-plus";
// Flash over Plus: live translation is latency-bound, and short sentences
// don't need the bigger model
export const QWEN_DEFAULT_MODEL: TranslationModel = "qwen/qwen3.8-flash";
export const OPENAI_DEFAULT_MODEL: TranslationModel = "gpt-5-nano";

// Default for users without an admin-assigned model: the first configured
// of Qwen-MT Plus (DashScope), Qwen3.8 Flash (OpenRouter), GPT-5 Nano
export function getDefaultModel(): TranslationModel {
  if (process.env.DASHSCOPE_API_KEY) return QWEN_MT_DEFAULT_MODEL;
  if (process.env.OPENROUTER_API_KEY) return QWEN_DEFAULT_MODEL;
  return OPENAI_DEFAULT_MODEL;
}

export interface MonthlyUsage {
  stt_seconds: number;
  llm_input_tokens: number;
  llm_output_tokens: number;
}

export interface AuthUser {
  name: string;
  addedAt: string;
  model?: string;
  usage?: Record<string, MonthlyUsage>; // key = "2026-02"
}

export type AuthUsers = Record<string, AuthUser>;

let _client: EdgeConfigClient | null = null;
function getClient(): EdgeConfigClient {
  if (!_client) {
    _client = createClient(process.env.EDGE_CONFIG);
  }
  return _client;
}

export async function getAuthUsers(): Promise<AuthUsers> {
  const users = await getClient().get<AuthUsers>("auth_users");
  return users ?? {};
}

export async function isAuthorizedEmail(email: string): Promise<boolean> {
  const users = await getAuthUsers();
  return email.toLowerCase() in users;
}

export async function getUserByEmail(
  email: string
): Promise<AuthUser | null> {
  const users = await getAuthUsers();
  return users[email.toLowerCase()] ?? null;
}

export async function getUserModel(email: string): Promise<string> {
  const user = await getUserByEmail(email);
  return user?.model || getDefaultModel();
}

// --- Meeting codes ---

export interface MeetingCode {
  createdAt: string;
  expiresAt: string;
}

export type MeetingCodes = Record<string, MeetingCode>;

export async function getMeetingCodes(): Promise<MeetingCodes> {
  const codes = await getClient().get<MeetingCodes>("meeting_codes");
  return codes ?? {};
}

export async function updateMeetingCodes(codes: MeetingCodes): Promise<void> {
  const edgeConfigId = process.env.EDGE_CONFIG_ID;
  const vercelToken = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!edgeConfigId || !vercelToken) {
    throw new Error("EDGE_CONFIG_ID or VERCEL_API_TOKEN is not set");
  }

  const url = new URL(
    `https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`
  );
  if (teamId) url.searchParams.set("teamId", teamId);

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: [{ operation: "upsert", key: "meeting_codes", value: codes }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Edge Config update failed: ${res.status} ${text}`);
  }
}

export async function updateAuthUsers(users: AuthUsers): Promise<void> {
  const edgeConfigId = process.env.EDGE_CONFIG_ID;
  const vercelToken = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!edgeConfigId || !vercelToken) {
    throw new Error("EDGE_CONFIG_ID or VERCEL_API_TOKEN is not set");
  }

  const url = new URL(
    `https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`
  );
  if (teamId) url.searchParams.set("teamId", teamId);

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: [{ operation: "upsert", key: "auth_users", value: users }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Edge Config update failed: ${res.status} ${text}`);
  }
}

// --- Usage tracking ---

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function incrementUsage(
  email: string,
  delta: Partial<MonthlyUsage>
): Promise<void> {
  if (!email) return;
  const key = email.toLowerCase();
  const users = await getAuthUsers();
  const user = users[key];
  if (!user) return;

  const month = getCurrentMonthKey();
  const prev = user.usage?.[month] ?? { stt_seconds: 0, llm_input_tokens: 0, llm_output_tokens: 0 };

  users[key] = {
    ...user,
    usage: {
      ...user.usage,
      [month]: {
        stt_seconds: prev.stt_seconds + (delta.stt_seconds ?? 0),
        llm_input_tokens: prev.llm_input_tokens + (delta.llm_input_tokens ?? 0),
        llm_output_tokens: prev.llm_output_tokens + (delta.llm_output_tokens ?? 0),
      },
    },
  };

  await updateAuthUsers(users);
}
