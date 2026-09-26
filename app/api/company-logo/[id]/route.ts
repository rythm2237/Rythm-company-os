import { createAuthServerClient } from "@/lib/supabase/auth-server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Vary": "Cookie" };
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new Response(null, { status: 404, headers });
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401, headers });
  // Both the branding row and the private Storage object enforce RLS with the caller's session.
  const { data, error } = await supabase.from("organization_branding").select("logo_path").eq("organization_id", id).maybeSingle();
  if (error || !data?.logo_path) return new Response(null, { status: 404, headers });
  const file = await supabase.storage.from("company-logos").download(data.logo_path);
  if (file.error || !file.data) return new Response(null, { status: 404, headers });
  return new Response(await file.data.arrayBuffer(), { headers: { ...headers, "Content-Type": "image/webp" } });
}
