import { NextResponse } from "next/server";
import { getPublicStatusSnapshot } from "@/lib/public-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = getPublicStatusSnapshot();
  const responseStatus = snapshot.status === "attention_required" ? 503 : 200;

  return NextResponse.json(snapshot, {
    status: responseStatus,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
