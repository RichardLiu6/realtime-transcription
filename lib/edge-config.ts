import { createClient, type EdgeConfigClient } from "@vercel/edge-config";
import { isSupportedModel, QWEN_MT_DEFAULT_MODEL, OPENROUTER_DEFAULT_MODEL, type TranslationModel } from "@/lib/models";

export { SUPPORTED_MODELS, type TranslationModel } from "@/lib/models";

// Default for users without an admin-assigned model: the OpenRouter default.
// A DashScope key alone doesn't change it (Qwen-MT is then assigned per user
// in admin, and joins the fallback chain); Qwen-MT is the default only when
// DashScope is the sole provider configured.
export function getDefaultModel(): TranslationModel {
  if (!process.env.OPENROUTER_API_KEY && process.env.DASHSCOPE_API_KEY) return QWEN_MT_DEFAULT_MODEL;
  return OPENROUTER_DEFAULT_MODEL;
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
  // A model dropped from the pool (e.g. an old GPT/Claude assignment) falls
  // back to the default
  return isSupportedModel(user?.model) ? user.model : getDefaultModel();
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
