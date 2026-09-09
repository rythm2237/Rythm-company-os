import { NextResponse } from "next/server";
import { dispatchDueAutomationTasks } from "@/lib/admin/automation/executor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized scheduler request." }, { status: 401 });
  }

  try {
    const results = await dispatchDueAutomationTasks();
    return NextResponse.json({ ok: true, dispatched: results.length, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Automation dispatcher failed." }, { status: 500 });
  }
}
