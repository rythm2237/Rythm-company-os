import type { SupabaseClient } from "@supabase/supabase-js";
import { AIWorkspaceError } from "@/lib/ai-workspace/service";

type Candidate = { content: string; source: string; score: number };

export async function retrieveWorkspaceContext(
  client: SupabaseClient,
  workspaceId: string,
  projectId: string,
  prompt: string,
) {
  const needles = [...new Set(prompt.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 3))].slice(0, 24);
  const candidates: Candidate[] = [];
  if (!workspaceId || !projectId) throw new AIWorkspaceError("RETRIEVAL_SCOPE_REQUIRED", 403);
  if (!needles.length) return { context: "", sources: [] as string[] };

  const [memories, chunks] = await Promise.all([
    client.from("aiw_memories").select("workspace_id,project_id,title,content,scope")
      .eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(80),
    client.from("aiw_file_chunks")
      .select("workspace_id,project_id,content,aiw_files!inner(workspace_id,project_id,filename,ingestion_status)")
      .eq("workspace_id", workspaceId).eq("project_id", projectId)
      .eq("aiw_files.workspace_id", workspaceId).eq("aiw_files.project_id", projectId)
      .eq("aiw_files.ingestion_status", "ready").limit(160),
  ]);
  if (memories.error || chunks.error) throw new AIWorkspaceError("RETRIEVAL_UNAVAILABLE", 503);

  function add(content: string, source: string) {
    const lower = content.toLocaleLowerCase();
    const score = needles.filter((term) => lower.includes(term)).length;
    if (score) candidates.push({ content, source, score });
  }
  for (const memory of memories.data ?? []) {
    if (memory.workspace_id !== workspaceId) continue;
    if (!(memory.scope === "personal" && memory.project_id === null) &&
        !(memory.scope === "project" && memory.project_id === projectId)) continue;
    add(memory.content, `memory:${memory.title}`);
  }
  for (const chunk of chunks.data ?? []) {
    const file = chunk.aiw_files as unknown as {
      workspace_id: string; project_id: string; filename: string; ingestion_status: string;
    } | null;
    if (chunk.workspace_id !== workspaceId || chunk.project_id !== projectId ||
        file?.workspace_id !== workspaceId || file.project_id !== projectId ||
        file.ingestion_status !== "ready") continue;
    add(chunk.content, `file:${file.filename}`);
  }

  candidates.sort((a, b) => b.score - a.score);
  let remaining = 16000;
  const context: Array<{ source: string; content: string }> = [];
  for (const item of candidates.slice(0, 8)) {
    if (!remaining) break;
    const content = item.content.slice(0, remaining);
    remaining -= content.length;
    context.push({ source: item.source, content });
  }
  return {
    context: context.length ? JSON.stringify(context) : "",
    sources: [...new Set(context.map((item) => item.source))],
  };
}
