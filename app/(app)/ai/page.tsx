import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AIWorkspaceClient from "@/components/ai-workspace/AIWorkspaceClient";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const metadata: Metadata = { title: "RYTHM AI", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AIWorkspacePage() {
  const auth = await createAuthServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/login?next=/ai");
  return <AIWorkspaceClient />;
}
