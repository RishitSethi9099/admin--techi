import { NextResponse, type NextRequest } from "next/server";
import { runBackup } from "@/lib/backup";

// Called every 30 minutes by the GitHub Action in the backup repo (.github/workflows/backup.yml).
// Protected by BACKUP_CRON_SECRET, sent as "Authorization: Bearer <secret>".
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const secret = process.env.BACKUP_CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, message: "BACKUP_CRON_SECRET is not set in Vercel." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: "Wrong or missing backup secret." }, { status: 401 });
  }
  const result = await runBackup({ type: "scheduled" });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
