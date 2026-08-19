"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { chunkCompanyDocument, extractCompanyDocument } from "@/lib/company-library-ingestion";

const categories = new Set(["general","brand","people","contact","product","service","process","operations","analytics","finance","sales","legal","website","other"]);
const confidentialityLevels = new Set(["public","internal","confidential","restricted"]);
const MAX_FILE_SIZE = 15 * 1024 * 1024;

function cleanList(values: string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, 30);
}

export type RegisterCompanyDocumentInput = {
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  title: string;
  category: string;
  confidentiality: string;
  allowedDepartments?: string[];
  allowedRoleKeywords?: string[];
};

export async function registerCompanyLibraryDocument(input: RegisterCompanyDocumentInput) {
  const context = await requireActiveOwnerOrganizationContext();
  const expectedPrefix = `${context.organizationId}/`;
  const storagePath = String(input.storagePath ?? "").trim();
  const fileName = String(input.fileName ?? "").trim().slice(0, 220);
  const mimeType = String(input.mimeType ?? "application/octet-stream").trim().slice(0, 160);
  const fileSize = Number(input.fileSize ?? 0);
  const title = String(input.title ?? fileName).trim().slice(0, 180) || fileName;
  const category = categories.has(input.category) ? input.category : "general";
  const confidentiality = confidentialityLevels.has(input.confidentiality) ? input.confidentiality : "internal";
  const allowedDepartments = cleanList(input.allowedDepartments);
  const allowedRoleKeywords = cleanList(input.allowedRoleKeywords);

  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes("..")) throw new Error("Invalid Company Library storage path.");
  if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) throw new Error("Company Library files must be between 1 byte and 15 MB.");
  if ((confidentiality === "confidential" || confidentiality === "restricted") && !allowedDepartments.length && !allowedRoleKeywords.length) {
    throw new Error("Confidential or restricted documents require at least one allowed department or role keyword.");
  }

  const { data: existingHashCandidate } = await context.supabase
    .from("company_knowledge")
    .select("id,storage_path")
    .eq("organization_id", context.organizationId)
    .eq("storage_path", storagePath)
    .maybeSingle();
  if (existingHashCandidate) return { ok: true, knowledgeId: existingHashCandidate.id, status: "existing" };

  const { data: knowledge, error: insertError } = await context.supabase
    .from("company_knowledge")
    .insert({
      organization_id: context.organizationId,
      title,
      category,
      source_type: "file",
      storage_path: storagePath,
      mime_type: mimeType,
      confidentiality,
      allowed_departments: allowedDepartments,
      allowed_role_keywords: allowedRoleKeywords,
      transferable: false,
      status: "active",
      ingestion_status: "processing",
      source_filename: fileName,
      file_size_bytes: fileSize,
      last_ingestion_error: null,
    })
    .select("id")
    .single();
  if (insertError || !knowledge) throw new Error(`Could not register Company Library document: ${insertError?.message ?? "unknown error"}`);

  const knowledgeId = String(knowledge.id);
  try {
    const { data: storedFile, error: downloadError } = await context.supabase.storage.from("company-knowledge").download(storagePath);
    if (downloadError || !storedFile) throw new Error(`Stored document could not be read: ${downloadError?.message ?? "missing file"}`);
    const buffer = Buffer.from(await storedFile.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_FILE_SIZE) throw new Error("Stored document size is outside the allowed Company Library limit.");

    const extracted = await extractCompanyDocument(buffer, fileName, mimeType || storedFile.type);
    const chunks = chunkCompanyDocument(extracted.text);
    if (!chunks.length) throw new Error("The document could not be divided into searchable knowledge chunks.");

    const { error: chunksError } = await context.supabase.from("company_knowledge_chunks").insert(
      chunks.map((chunk) => ({
        organization_id: context.organizationId,
        knowledge_id: knowledgeId,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        metadata: { ...chunk.metadata, source_filename: fileName },
      })),
    );
    if (chunksError) throw new Error(`Company Library indexing failed: ${chunksError.message}`);

    const { error: readyError } = await context.supabase.from("company_knowledge").update({
      content: extracted.text,
      content_hash: extracted.hash,
      summary: extracted.summary,
      extracted_at: new Date().toISOString(),
      chunk_count: chunks.length,
      ingestion_status: "ready",
      last_ingestion_error: null,
      updated_at: new Date().toISOString(),
    }).eq("organization_id", context.organizationId).eq("id", knowledgeId);
    if (readyError) throw new Error(`Company Library finalization failed: ${readyError.message}`);

    await context.supabase.from("audit_events").insert({
      organization_id: context.organizationId,
      actor_type: "user",
      actor_user_id: context.user.id,
      event_type: "company_library.document_ingested",
      object_type: "company_knowledge",
      object_id: knowledgeId,
      risk_level: confidentiality === "restricted" ? "medium" : "low",
      payload: { file_name: fileName, mime_type: mimeType, file_size_bytes: fileSize, chunk_count: chunks.length, confidentiality, transferable: false },
    });

    revalidatePath("/company-library");
    return { ok: true, knowledgeId, status: "ready", chunkCount: chunks.length };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 900) : "Company Library ingestion failed.";
    await context.supabase.from("company_knowledge_chunks").delete().eq("organization_id", context.organizationId).eq("knowledge_id", knowledgeId);
    await context.supabase.from("company_knowledge").update({
      ingestion_status: "failed",
      last_ingestion_error: message,
      updated_at: new Date().toISOString(),
    }).eq("organization_id", context.organizationId).eq("id", knowledgeId);
    revalidatePath("/company-library");
    throw new Error(message);
  }
}

export async function deleteCompanyLibraryDocument(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const knowledgeId = String(formData.get("knowledgeId") ?? "");
  const { data: knowledge } = await context.supabase
    .from("company_knowledge")
    .select("id,storage_path,title")
    .eq("organization_id", context.organizationId)
    .eq("id", knowledgeId)
    .maybeSingle();
  if (!knowledge) return;

  if (knowledge.storage_path) {
    const { error: storageError } = await context.supabase.storage.from("company-knowledge").remove([knowledge.storage_path]);
    if (storageError) throw new Error(`Could not remove the private source file: ${storageError.message}`);
  }
  const { error } = await context.supabase.from("company_knowledge").delete().eq("organization_id", context.organizationId).eq("id", knowledgeId);
  if (error) throw new Error(`Could not remove Company Library document: ${error.message}`);

  await context.supabase.from("audit_events").insert({
    organization_id: context.organizationId,
    actor_type: "user",
    actor_user_id: context.user.id,
    event_type: "company_library.document_deleted",
    object_type: "company_knowledge",
    object_id: knowledgeId,
    risk_level: "low",
    payload: { title: knowledge.title },
  });
  revalidatePath("/company-library");
}
