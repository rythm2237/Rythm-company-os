import { NextRequest, NextResponse } from "next/server";
import { fetchPublicResource } from "@/lib/security/public-url";

const ALLOWED_HOSTS = new Set(["images.unsplash.com"]);

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) return new NextResponse("Missing image URL", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("Invalid image URL", { status: 400 });
  }

  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return new NextResponse("Image host not allowed", { status: 403 });
  }

  try {
    const {response,bytes}=await fetchPublicResource(target,{timeoutMs:8000,maxBytes:8*1024*1024,maxRedirects:3,allowedHosts:[...ALLOWED_HOSTS],headers:{Accept:"image/avif,image/webp,image/jpeg,image/*"}});

    if (!response.ok || !response.body) {
      return new NextResponse("Image unavailable", { status: 502 });
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse("Image proxy failed", { status: 502 });
  }
}
