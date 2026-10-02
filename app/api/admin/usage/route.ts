import { NextRequest, NextResponse } from "next/server";
import { meetingsAvailable } from "@/lib/meetings/db";
import { monthKey, SONIOX_USD_PER_HOUR, usageForMonth } from "@/lib/usage";
import { sonioxMonths, sonioxUsageAvailable, sonioxUsageForMonth, syncSonioxUsage, type SonioxMonth } from "@/lib/sonioxUsage";

// Copy Soniox's usage logs when the last copy is older than this
const SYNC_MAX_AGE_MS = 5 * 60 * 1000;

// Admin (admin_token, checked by middleware): usage and cost per user for
// one month (?month=YYYY-MM, default the current one, UTC)
export async function GET(req: NextRequest) {
  if (!meetingsAvailable()) return NextResponse.json({ available: false });
  const asked = req.nextUrl.searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(asked) ? asked : monthKey();
  try {
    // Transcription cost from Soniox's own logs; if they can't be read,
    // the last copy (or the list-price estimate) is shown with the error
    let soniox: SonioxMonth | null = null;
    let syncedAt: Date | null = null;
    let sonioxError: string | null = null;
    let extraMonths: string[] = [];
    if (sonioxUsageAvailable()) {
      try {
        syncedAt = await syncSonioxUsage(SYNC_MAX_AGE_MS, AbortSignal.timeout(20_000));
      } catch (error) {
        console.error("[usage] Soniox sync failed:", error);
        sonioxError = error instanceof Error ? error.message : String(error);
      }
      [soniox, extraMonths] = await Promise.all([sonioxUsageForMonth(month), sonioxMonths()]);
    }
    const { months, users } = await usageForMonth(month, soniox);
    const allMonths = Array.from(new Set([month, monthKey(), ...months, ...extraMonths])).sort().reverse();
    return NextResponse.json({
      available: true,
      month,
      months: allMonths,
      users,
      sonioxUsdPerHour: SONIOX_USD_PER_HOUR,
      stt: {
        source: soniox?.attributed ? "soniox" : "estimate",
        // Soniox's bill for the month, users or not (null: not read)
        sonioxTotalUsd: soniox ? soniox.totalUsd : null,
        syncedAt,
        error: sonioxError,
      },
    });
  } catch (error) {
    console.error("[usage] admin read failed:", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}
