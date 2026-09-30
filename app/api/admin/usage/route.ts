import { NextRequest, NextResponse } from "next/server";
import { meetingsAvailable } from "@/lib/meetings/db";
import { monthKey, SONIOX_USD_PER_HOUR, usageForMonth } from "@/lib/usage";

// Admin (admin_token, checked by middleware): usage and cost per user for
// one month (?month=YYYY-MM, default the current one, UTC)
export async function GET(req: NextRequest) {
  if (!meetingsAvailable()) return NextResponse.json({ available: false });
  const asked = req.nextUrl.searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(asked) ? asked : monthKey();
  try {
    const { months, users } = await usageForMonth(month);
    return NextResponse.json({ available: true, month, months, users, sonioxUsdPerHour: SONIOX_USD_PER_HOUR });
  } catch (error) {
    console.error("[usage] admin read failed:", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}
