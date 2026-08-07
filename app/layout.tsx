import type { Metadata } from "next";
import "./globals.css";
import ProjectPulse from "@/components/project-pulse/ProjectPulse";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const metadata: Metadata = {
  title: "RYTHM Company OS",
  description: "AI-native company operating system",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let pulseEvent = null;
  let pulseNodes: Array<{stage_code:string;label:string;sequence_no:number;weight_percent:number;node_type:string}> = [];
  let pulseProject = null;

  try {
    const supabase = await createAuthServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: membership } = await supabase.from("organization_members")
        .select("organization_id").eq("user_id", user.id).maybeSingle();
      if (membership) {
        const { data: event } = await supabase.from("project_progress_events")
          .select("id,project_id,event_type,event_label,previous_progress,new_progress,previous_node,new_node,event_state,next_step,created_at")
          .eq("organization_id", membership.organization_id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (event) {
          const [nodesResult, projectResult] = await Promise.all([
            supabase.from("project_progress_nodes")
              .select("stage_code,label,sequence_no,weight_percent,node_type")
              .eq("project_id", event.project_id).order("sequence_no"),
            supabase.from("projects").select("project_code,name").eq("id", event.project_id).maybeSingle(),
          ]);
          pulseEvent = event;
          pulseNodes = nodesResult.data ?? [];
          pulseProject = projectResult.data;
        }
      }
    }
  } catch {
    // Pulse is progressive enhancement. Pre-migration/login surfaces must keep rendering.
  }

  return (
    <html lang="en">
      <body>
        {children}
        <ProjectPulse event={pulseEvent} nodes={pulseNodes} project={pulseProject} />
      </body>
    </html>
  );
}
