import { NextRequest, NextResponse } from "next/server";

const INDEXNOW_KEY = "c748d1bac3f68dc3ac51e3aee6b623a7";
const SUBMIT_TOKEN = "9SuTLHM6P3eDf3stNs-KY_ik996sC3Fk";
const HOST = "company.rythm-os.com";
const BASE = `https://${HOST}`;

const urlList = [
  `${BASE}/`,
  `${BASE}/product`,
  `${BASE}/demo`,
  `${BASE}/solutions`,
  `${BASE}/templates`,
  `${BASE}/pricing`,
  `${BASE}/enterprise`,
  `${BASE}/live-ai-meeting`,
  `${BASE}/trust`,
  `${BASE}/security`,
  `${BASE}/support`,
  `${BASE}/legal`,
  `${BASE}/privacy`,
  `${BASE}/terms`,
  `${BASE}/cookies`,
];

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("token") !== SUBMIT_TOKEN) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: HOST,
      key: INDEXNOW_KEY,
      keyLocation: `${BASE}/${INDEXNOW_KEY}.txt`,
      urlList,
    }),
    cache: "no-store",
  });

  const body = await response.text();

  return NextResponse.json({
    ok: response.ok,
    status: response.status,
    body,
    submitted: urlList.length,
  }, { status: response.ok ? 200 : 502 });
}
