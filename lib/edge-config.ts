import { createClient, type EdgeConfigClient } from "@vercel/edge-config";

export interface AuthUser {
  name: string;
  addedAt: string;
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
