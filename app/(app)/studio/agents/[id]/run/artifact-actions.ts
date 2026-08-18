"use server";

import { randomUUID } from "crypto";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import type { ChartSpec } from "./actions";

export type SaveArtifactInput = {
  agentId: string;
  artifactType: "text" | "report" | "image" | "chart" | "table" | "file";
  title: string;
  sourceOutputType?: string;
  textContent?: string;
  chartSpec?: ChartSpec;
  imageDataUrl?: string;
  metadata?: Record<string, unknown>;
};

function cleanTitle(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 180) || "Agent artifact";
}

function safeFilename(value: string) {
  return cleanTitle(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "agent-artifact";
}

function parseImageDataUrl(value: string) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error("Generated image format is not supported for saving.");
  const mimeType = match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 24 * 1024 * 1024) throw new Error("Generated image is too large to save.");
  return { mimeType, bytes, extension: mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] };
}

export async function saveAgentArtifact(input: SaveArtifactInput) {
  try {
    const context = await requireActiveOwnerOrganizationContext();
    const { data: agent, error: agentError } = await context.supabase
      .from("agents")
      .select("id")
      .eq("id", input.agentId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (agentError || !agent) return { ok: false as const, error: "Agent not found in this organization." };

    const title = cleanTitle(input.title);
    let storagePath: string | null = null;
    let mimeType: string | null = null;

    if (input.artifactType === "image" && input.imageDataUrl) {
      const image = parseImageDataUrl(input.imageDataUrl);
      storagePath = `${context.organizationId}/${input.agentId}/${randomUUID()}-${safeFilename(title)}.${image.extension}`;
      mimeType = image.mimeType;
      const { error: uploadError } = await context.supabase.storage
        .from("agent-artifacts")
        .upload(storagePath, image.bytes, { contentType: image.mimeType, upsert: false });
      if (uploadError) throw new Error(`Artifact file could not be saved: ${uploadError.message}`);
    }

    const structuredContent = input.chartSpec ? input.chartSpec : null;
    const { data, error } = await context.supabase
      .from("agent_artifacts")
      .insert({
        organization_id: context.organizationId,
        agent_id: input.agentId,
        artifact_type: input.artifactType,
        title,
        source_output_type: input.sourceOutputType || null,
        text_content: input.textContent?.slice(0, 120000) || null,
        structured_content: structuredContent,
        storage_path: storagePath,
        mime_type: mimeType,
        metadata: input.metadata ?? {},
      })
      .select("id,created_at")
      .single();

    if (error || !data) {
      if (storagePath) await context.supabase.storage.from("agent-artifacts").remove([storagePath]);
      throw new Error("Artifact metadata could not be saved.");
    }

    return { ok: true as const, artifactId: data.id as string, createdAt: data.created_at as string };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Artifact could not be saved." };
  }
}
