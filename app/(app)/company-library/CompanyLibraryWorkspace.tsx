"use client";

import { useMemo, useState, useTransition } from "react";
import { deleteCompanyLibraryDocument, getCompanyLibraryDocumentDetail, getCompanyLibraryDocumentUrl, updateCompanyLibraryDocumentMetadata } from "./actions";
import styles from "./CompanyLibraryWorkspace.module.css";

export type CompanyLibraryListDocument = {
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

type Detail = {
  id: string;
  title: string;
  category: string;
  confidentiality: string;
  sourceFilename: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  content: string | null;
  summary: string | null;
  allowedDepartments: string[];
  allowedRoleKeywords: string[];
  ingestionStatus: string;
  chunkCount: number;
  extractedAt: string | null;
  updatedAt: string;
};

function sizeLabel(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CompanyLibraryWorkspace({ documents }: { documents: CompanyLibraryListDocument[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [confidentiality, setConfidentiality] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<"preview" | "details" | "edit">("preview");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const categories = useMemo(() => [...new Set(documents.map((d) => d.category))].sort(), [documents]);
  const filtered = useMemo(() => documents.filter((document) => {
    const haystack = `${document.title} ${document.source_filename ?? ""} ${document.category}`.toLowerCase();
    return (!query.trim() || haystack.includes(query.trim().toLowerCase()))
      && (category === "all" || document.category === category)
      && (status === "all" || document.ingestion_status === status)
      && (confidentiality === "all" || document.confidentiality === confidentiality);
  }), [documents, query, category, status, confidentiality]);

  function openDocument(id: string) {
    setSelectedId(id);
    setDetail(null);
    setTab("preview");
    setError(null);
    startTransition(async () => {
      try {
        const result = await getCompanyLibraryDocumentDetail(id);
        setDetail(result);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load this document.");
      }
    });
  }

  async function openOriginal() {
    if (!selectedId) return;
    setError(null);
    const popup = window.open("", "_blank");
    try {
      const result = await getCompanyLibraryDocumentUrl(selectedId);
      if (popup) popup.location.href = result.url;
      else window.location.href = result.url;
    } catch (cause) {
      popup?.close();
      setError(cause instanceof Error ? cause.message : "Could not open the source file.");
    }
  }

  const selectedListItem = selectedId ? documents.find((document) => document.id === selectedId) : null;

  return (
    <div className={styles.workspace}>
      <section className={styles.listPane} aria-label="Company documents">
        <div className={styles.toolbar}>
          <input className={styles.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents…" aria-label="Search documents" />
          <span className={styles.count}>{filtered.length} / {documents.length}</span>
        </div>
        <div className={styles.filters}>
          <select className={styles.select} value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
            <option value="all">All categories</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className={styles.select} value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
            <option value="all">All statuses</option><option value="ready">Ready</option><option value="processing">Processing</option><option value="failed">Failed</option>
          </select>
          <select className={styles.select} value={confidentiality} onChange={(event) => setConfidentiality(event.target.value)} aria-label="Filter by confidentiality">
            <option value="all">All access levels</option><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option>
          </select>
        </div>
        <div className={styles.docList}>
          {filtered.length === 0 ? <div className={styles.empty}>No documents match these filters.</div> : filtered.map((document) => (
            <button type="button" key={document.id} onClick={() => openDocument(document.id)} className={`${styles.row} ${selectedId === document.id ? styles.rowActive : ""}`}>
              <div className={styles.rowTop}>
                <span className={styles.rowTitle}>{document.title}</span>
                <span className={`${styles.status} ${document.ingestion_status === "ready" ? styles.ready : document.ingestion_status === "failed" ? styles.failed : ""}`}>{document.ingestion_status}</span>
              </div>
              <p className={styles.meta}>{document.source_filename ?? "Uploaded document"} · {sizeLabel(document.file_size_bytes)}</p>
              <p className={styles.meta}>{document.category} · {document.confidentiality} · {document.chunk_count || 0} chunks</p>
            </button>
          ))}
        </div>
      </section>

      <section className={`${styles.detailPane} ${selectedId ? styles.detailOpen : ""}`} aria-label="Document details">
        {!selectedId ? <div className={styles.empty}>Select a document to read it, open the original file, or manage its metadata.</div> : (
          <>
            <header className={styles.detailHeader}>
              <div>
                <p className={styles.eyebrow}>{selectedListItem?.category} · {selectedListItem?.confidentiality}</p>
                <h3 className={styles.detailTitle}>{selectedListItem?.title}</h3>
                <p className={styles.meta}>{selectedListItem?.source_filename ?? "Uploaded document"} · {sizeLabel(selectedListItem?.file_size_bytes ?? null)}</p>
              </div>
              <div className={styles.actions}>
                <button type="button" className={`${styles.action} ${styles.mobileClose}`} onClick={() => setSelectedId(null)}>Close</button>
                <button type="button" className={styles.action} onClick={openOriginal}>Open original</button>
              </div>
            </header>
            <nav className={styles.tabs} aria-label="Document views">
              {(["preview","details","edit"] as const).map((name) => <button key={name} type="button" className={`${styles.tab} ${tab === name ? styles.tabActive : ""}`} onClick={() => setTab(name)}>{name === "preview" ? "Read" : name === "details" ? "Details" : "Edit"}</button>)}
            </nav>
            <div className={styles.detailBody}>
              {error ? <p className={styles.error}>{error}</p> : null}
              {isPending && !detail ? <p className={styles.loading}>Loading document…</p> : null}
              {detail && tab === "preview" ? (
                <>
                  {detail.summary ? <><p className={styles.eyebrow}>AI EXTRACTED SUMMARY</p><div className={styles.summary}>{detail.summary}</div></> : null}
                  <p className={styles.eyebrow} style={{marginTop:"1.25rem"}}>EXTRACTED CONTENT</p>
                  <div className={styles.content}>{detail.content || "No extracted text is available for this document."}</div>
                </>
              ) : null}
              {detail && tab === "details" ? (
                <div className={styles.grid}>
                  <div><p className={styles.eyebrow}>STATUS</p><p>{detail.ingestionStatus}</p></div>
                  <div><p className={styles.eyebrow}>INDEX</p><p>{detail.chunkCount} searchable chunks</p></div>
                  <div><p className={styles.eyebrow}>TYPE</p><p>{detail.mimeType ?? "Unknown"}</p></div>
                  <div><p className={styles.eyebrow}>SIZE</p><p>{sizeLabel(detail.fileSizeBytes)}</p></div>
                  <div><p className={styles.eyebrow}>EXTRACTED</p><p>{detail.extractedAt ? new Date(detail.extractedAt).toLocaleString() : "—"}</p></div>
                  <div><p className={styles.eyebrow}>UPDATED</p><p>{new Date(detail.updatedAt).toLocaleString()}</p></div>
                  <div className={styles.full}><p className={styles.eyebrow}>ALLOWED DEPARTMENTS</p><p>{detail.allowedDepartments.length ? detail.allowedDepartments.join(", ") : "All permitted roles under the selected confidentiality level"}</p></div>
                  <div className={styles.full}><p className={styles.eyebrow}>ALLOWED ROLE KEYWORDS</p><p>{detail.allowedRoleKeywords.length ? detail.allowedRoleKeywords.join(", ") : "—"}</p></div>
                </div>
              ) : null}
              {detail && tab === "edit" ? (
                <form action={updateCompanyLibraryDocumentMetadata} onSubmit={() => setTimeout(() => openDocument(detail.id), 500)}>
                  <input type="hidden" name="knowledgeId" value={detail.id} />
                  <div className={styles.grid}>
                    <div className={`${styles.field} ${styles.full}`}><label htmlFor="library-title">Title</label><input id="library-title" className={styles.input} name="title" defaultValue={detail.title} maxLength={180} required /></div>
                    <div className={styles.field}><label htmlFor="library-category">Category</label><select id="library-category" className={styles.select} name="category" defaultValue={detail.category}>{["general","brand","people","contact","product","service","process","operations","analytics","finance","sales","legal","website","other"].map((item)=><option key={item} value={item}>{item}</option>)}</select></div>
                    <div className={styles.field}><label htmlFor="library-confidentiality">Confidentiality</label><select id="library-confidentiality" className={styles.select} name="confidentiality" defaultValue={detail.confidentiality}><option value="public">public</option><option value="internal">internal</option><option value="confidential">confidential</option><option value="restricted">restricted</option></select></div>
                    <div className={`${styles.field} ${styles.full}`}><label htmlFor="library-departments">Allowed departments</label><input id="library-departments" className={styles.input} name="allowedDepartments" defaultValue={detail.allowedDepartments.join(", ")} placeholder="Legal, Finance, Operations" /></div>
                    <div className={`${styles.field} ${styles.full}`}><label htmlFor="library-roles">Allowed role keywords</label><input id="library-roles" className={styles.input} name="allowedRoleKeywords" defaultValue={detail.allowedRoleKeywords.join(", ")} placeholder="owner, legal, finance" /></div>
                  </div>
                  <p className={styles.helper}>Changing metadata does not rewrite the source file or the extracted text. Confidential/restricted documents require at least one allowed department or role keyword.</p>
                  <div className={styles.saveRow}><button className={styles.action} type="submit">Save changes</button></div>
                </form>
              ) : null}
              {detail ? <form action={deleteCompanyLibraryDocument} style={{marginTop:"1.5rem"}}><input type="hidden" name="knowledgeId" value={detail.id} /><button className={styles.danger} type="submit">Delete document</button></form> : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
