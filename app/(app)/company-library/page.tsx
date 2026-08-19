import Link from "next/link";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import CompanyLibraryUploader from "./CompanyLibraryUploader";
import { deleteCompanyLibraryDocument } from "./actions";

export const dynamic = "force-dynamic";

type LibraryRow = {
  id: string;
  title: string;
  category: string;
  source_filename: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  confidentiality: string;
  ingestion_status: string;
  chunk_count: number;
  summary: string | null;
  last_ingestion_error: string | null;
  extracted_at: string | null;
  updated_at: string;
};

function sizeLabel(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function CompanyLibraryPage() {
  const context = await requireActiveOwnerOrganizationContext();
  const { data } = await context.supabase
    .from("company_knowledge")
    .select("id,title,category,source_filename,mime_type,file_size_bytes,confidentiality,ingestion_status,chunk_count,summary,last_ingestion_error,extracted_at,updated_at")
    .eq("organization_id", context.organizationId)
    .eq("source_type", "file")
    .order("updated_at", { ascending: false });
  const documents = (data ?? []) as LibraryRow[];
  const ready = documents.filter((document) => document.ingestion_status === "ready").length;
  const chunks = documents.reduce((total, document) => total + Number(document.chunk_count || 0), 0);

  return (
    <main className="page-shell">
      <section className="panel">
        <p className="eyebrow">COMPANY MEMORY · PRIVATE DOCUMENT LIBRARY</p>
        <h1>Company Library</h1>
        <p>Upload the documents that define how this company works. New Agents connect to this live tenant-scoped library by default, and meetings can retrieve relevant internal knowledge without copying it into global professional foundations.</p>
        <p><strong>{ready}</strong> indexed documents · <strong>{chunks}</strong> searchable chunks · source files private.</p>
        <p><Link href="/studio/agents">Agent Studio</Link> · <Link href="/meetings/room">Boardroom</Link></p>
      </section>

      <section className="panel">
        <p className="eyebrow">ADD COMPANY KNOWLEDGE</p>
        <h2>Upload and index a document</h2>
        <CompanyLibraryUploader organizationId={context.organizationId} />
      </section>

      <section className="panel">
        <p className="eyebrow">LIBRARY INDEX</p>
        <h2>Company documents</h2>
        {documents.length === 0 ? <p>No company documents have been uploaded yet.</p> : (
          <div style={{ display: "grid", gap: ".8rem" }}>
            {documents.map((document) => (
              <article className="kpi-card" key={document.id}>
                <p className="eyebrow">{document.category.toUpperCase()} · {document.confidentiality.toUpperCase()}</p>
                <h3>{document.title}</h3>
                <p>{document.source_filename ?? "Uploaded document"} · {sizeLabel(document.file_size_bytes)} · <strong>{document.ingestion_status}</strong></p>
                {document.ingestion_status === "ready" ? <p>{document.chunk_count} indexed chunks · extracted {document.extracted_at ? new Date(document.extracted_at).toISOString().slice(0, 10) : "—"}</p> : null}
                {document.summary ? <p style={{ opacity: .78 }}>{document.summary.slice(0, 420)}{document.summary.length > 420 ? "…" : ""}</p> : null}
                {document.last_ingestion_error ? <p className="form-error">{document.last_ingestion_error}</p> : null}
                <form action={deleteCompanyLibraryDocument}>
                  <input type="hidden" name="knowledgeId" value={document.id} />
                  <button type="submit">Delete from Company Library</button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
