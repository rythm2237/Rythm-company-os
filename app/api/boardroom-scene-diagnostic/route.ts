import { NextResponse } from "next/server";
import chunk0 from "@/app/api/boardroom-preview-scene/chunk0";
import chunk1 from "@/app/api/boardroom-preview-scene/chunk1";
import chunk2 from "@/app/api/boardroom-preview-scene/chunk2";
import chunk3 from "@/app/api/boardroom-preview-scene/chunk3";

export const dynamic = "force-dynamic";

export function GET() {
  const base64 = `${chunk0}${chunk1}${chunk2}${chunk3}`;
  const bytes = Buffer.from(base64, "base64");
  const header = bytes.subarray(0, 4).toString("ascii");
  const format = bytes.subarray(8, 12).toString("ascii");
  const declaredPayloadSize = bytes.length >= 8 ? bytes.readUInt32LE(4) : null;
  const declaredTotalSize = declaredPayloadSize === null ? null : declaredPayloadSize + 8;

  return NextResponse.json({
    base64Length: base64.length,
    byteLength: bytes.length,
    header,
    format,
    declaredPayloadSize,
    declaredTotalSize,
    exactLengthMatch: declaredTotalSize === bytes.length,
    first16Hex: bytes.subarray(0, 16).toString("hex"),
  });
}
