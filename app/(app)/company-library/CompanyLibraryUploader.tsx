"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createAuthBrowserClient } from "@/lib/supabase/auth-browser";
import { registerCompanyLibraryDocument } from "./actions";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 160) || "document";
}

function list(value: string) {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

export default function CompanyLibraryUploader({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confidentiality, setConfidentiality] = useState("internal");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) { setError("Choose a document to upload."); return; }
    if (file.size > MAX_FILE_SIZE) { setError("Company Library files are limited to 15 MB."); return; }

    setPending(true);
    const supabase = createAuthBrowserClient();
    const storagePath = `${organizationId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    try {
      const { error: uploadError } = await supabase.storage.from("company-knowledge").upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (uploadError) throw new Error(`Private upload failed: ${uploadError.message}`);

      try {
        const result = await registerCompanyLibraryDocument({
          storagePath,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
          title: String(data.get("title") ?? "").trim() || file.name,
          category: String(data.get("category") ?? "general"),
          confidentiality,
          allowedDepartments: list(String(data.get("allowedDepartments") ?? "")),
          allowedRoleKeywords: list(String(data.get("allowedRoleKeywords") ?? "")),
        });
        setMessage(result.status === "ready" ? `Document indexed successfully (${result.chunkCount ?? 0} knowledge chunks).` : "Document is already registered.");
        form.reset();
        setConfidentiality("internal");
        router.refresh();
      } catch (registrationError) {
        await supabase.storage.from("company-knowledge").remove([storagePath]);
        throw registrationError;
      }
    } catch (uploadOrIngestionError) {
      setError(uploadOrIngestionError instanceof Error ? uploadOrIngestionError.message : "Company Library upload failed.");
    } finally {
      setPending(false);
    }
  }

  const restricted = confidentiality === "confidential" || confidentiality === "restricted";

  return (
    <form onSubmit={submit} className="auth-form">
      <label>Document<input name="file" type="file" required accept=".pdf,.docx,.pptx,.xlsx,.xls,.csv,.txt,.md,.json,.xml,application/pdf,text/plain,text/csv,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" /></label>
      <label>Library title<input name="title" placeholder="Defaults to the file name" maxLength={180} /></label>
      <label>Category<select name="category" defaultValue="general"><option value="general">General</option><option value="brand">Brand</option><option value="people">People / HR</option><option value="product">Product</option><option value="service">Service</option><option value="process">Process</option><option value="operations">Operations</option><option value="analytics">Analytics</option><option value="finance">Finance</option><option value="sales">Sales</option><option value="legal">Legal</option><option value="website">Website</option><option value="other">Other</option></select></label>
      <label>Confidentiality<select name="confidentiality" value={confidentiality} onChange={(event) => setConfidentiality(event.target.value)}><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option></select></label>
      {restricted ? <>
        <label>Allowed departments<textarea name="allowedDepartments" rows={2} placeholder="e.g. Finance, Legal — comma or one per line" /></label>
        <label>Allowed role keywords<textarea name="allowedRoleKeywords" rows={2} placeholder="e.g. CFO, counsel, compliance — comma or one per line" /></label>
        <p style={{ opacity: .72 }}>At least one department or role keyword is required for confidential/restricted documents.</p>
      </> : null}
      <p style={{ opacity: .72 }}>Private source files remain in the company&apos;s isolated Supabase Storage. Extracted content is tenant-scoped and never becomes global Agent knowledge.</p>
      {message ? <p className="form-success" role="status">{message}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button type="submit" disabled={pending}>{pending ? "Uploading and indexing…" : "Add to Company Library"}</button>
    </form>
  );
}
