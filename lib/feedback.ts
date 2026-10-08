// In-app feedback from logged-in users (Postgres `feedback`, read on the
// admin page). Server only.

import { randomBytes } from "crypto";
import { query } from "@/lib/meetings/db";

export const FEEDBACK_TOPICS = ["general", "pip"] as const;
export type FeedbackTopic = (typeof FEEDBACK_TOPICS)[number];

export const MAX_MESSAGE = 2000;
// Larger context (device info the page adds) is dropped, the message kept
const MAX_CONTEXT_BYTES = 4096;

export function isFeedbackTopic(value: unknown): value is FeedbackTopic {
  return typeof value === "string" && (FEEDBACK_TOPICS as readonly string[]).includes(value);
}

// A plain object that fits, else null
export function cleanContext(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const json = JSON.stringify(value);
    return Buffer.byteLength(json) <= MAX_CONTEXT_BYTES ? (JSON.parse(json) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function addFeedback(
  email: string,
  topic: FeedbackTopic,
  message: string,
  context: Record<string, unknown> | null
): Promise<void> {
  await query(`INSERT INTO feedback (id, email, topic, message, context) VALUES ($1, $2, $3, $4, $5)`, [
    randomBytes(16).toString("base64url"),
    email.toLowerCase(),
    topic,
    message,
    context === null ? null : JSON.stringify(context),
  ]);
}

export interface FeedbackRow {
  id: string;
  email: string;
  createdAt: string;
  topic: string;
  message: string;
  context: Record<string, unknown> | null;
}

export async function listFeedback(limit = 200): Promise<FeedbackRow[]> {
  const rows = await query<{
    id: string;
    email: string;
    created_at: Date;
    topic: string;
    message: string;
    context: Record<string, unknown> | null;
  }>(`SELECT id, email, created_at, topic, message, context FROM feedback ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    createdAt: r.created_at.toISOString(),
    topic: r.topic,
    message: r.message,
    context: r.context,
  }));
}
