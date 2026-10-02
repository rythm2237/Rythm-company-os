export interface Env {}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "donya-nail-art",
        environment: "cloudflare-foundation",
        timestamp: new Date().toISOString()
      });
    }

    return new Response(
      "Donya Nail Art Cloudflare foundation is online. Production traffic has not been migrated.",
      {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store"
        }
      }
    );
  }
};
