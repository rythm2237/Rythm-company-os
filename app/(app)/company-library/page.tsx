import Link from "next/link";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import CompanyLibraryUploader from "./CompanyLibraryUploader";
import CompanyLibraryWorkspace, { type CompanyLibraryListDocument } from "./CompanyLibraryWorkspace";

export const dynamic = "force-dynamic";

type LibraryRow = CompanyLibraryListDocument;

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
  const failed = documents.filter((document) => document.ingestion_status === "failed").length;

  return (
    <main className="page-shell">
      <section className="panel">
        <p className="eyebrow">COMPANY MEMORY · PRIVATE DOCUMENT LIBRARY</p>
        <h1>Company Library</h1>
        <p>Manage the source documents that define how this company works. Files remain tenant-isolated, while approved Agents and Boardroom sessions can retrieve indexed knowledge without turning extracted content into global policy.</p>
        <p><strong>{documents.length}</strong> documents · <strong>{ready}</strong> ready · <strong>{chunks}</strong> searchable chunks{failed ? <> · <strong>{failed}</strong> need attention</> : null}</p>
        <p><Link href="/studio/agents">Agent Studio</Link> · <Link href="/meetings/room">Boardroom</Link></p>
      </section>

      <section className="panel">
        <p className="eyebrow">ADD COMPANY KNOWLEDGE</p>
        <h2>Upload and index a document</h2>
        <CompanyLibraryUploader organizationId={context.organizationId} />
      </section>

      <section className="panel">
        <p className="eyebrow">LIBRARY WORKSPACE</p>
        <h2>Documents</h2>
        <p>Search, filter, read extracted content, open the original private file, update access metadata, or remove documents.</p>
        {documents.length === 0 ? <p>No company documents have been uploaded yet.</p> : <CompanyLibraryWorkspace documents={documents} />}
      </section>
    </main>
  );
}
