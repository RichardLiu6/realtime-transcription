import { NextRequest, NextResponse } from "next/server";
import { meetingsAvailable } from "@/lib/meetings/db";
import { currentUser } from "@/lib/meetings/repo";
import { withinDailyLimit } from "@/lib/rateLimit";
import { MAX_MESSAGE, addFeedback, cleanContext, isFeedbackTopic } from "@/lib/feedback";

const DAILY_LIMIT = 20;

// Feedback from a logged-in user (guests can't: no email to follow up)
export async function POST(req: NextRequest) {
  if (!meetingsAvailable()) return NextResponse.json({ error: "Not configured", code: "unavailable" }, { status: 503 });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Logged-in users only", code: "guest" }, { status: 403 });

  let body: { topic?: unknown; message?: unknown; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request", code: "invalid" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!isFeedbackTopic(body.topic) || !message || message.length > MAX_MESSAGE) {
    return NextResponse.json({ error: "Invalid request", code: "invalid" }, { status: 400 });
  }

  if (!(await withinDailyLimit("feedback", user.email, DAILY_LIMIT))) {
    return NextResponse.json({ error: "Daily limit reached", code: "limit" }, { status: 429 });
  }

  try {
    await addFeedback(user.email, body.topic, message, cleanContext(body.context));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[feedback] save failed:", error);
    return NextResponse.json({ error: "Unavailable", code: "unavailable" }, { status: 503 });
  }
}
