export const dynamic = "force-static";

export function GET(request: Request) {
  return Response.redirect(new URL("/boardroom-room-final.webp", request.url), 307);
}
