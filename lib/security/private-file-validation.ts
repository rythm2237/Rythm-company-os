/**
 * Server-side guard for private Storage objects. Storage keys are data, not
 * authority: a caller-writable DB row must never select an arbitrary key for a
 * service-role download.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_LEAF = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const MIME_EXTENSIONS: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.ms-excel": [".xls"],
  "text/csv": [".csv"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "application/json": [".json"],
  "application/xml": [".xml"],
  "text/xml": [".xml"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

export function isOrganizationStoragePath(organizationId: string, storagePath: string): boolean {
  if (!UUID.test(organizationId) || typeof storagePath !== "string") return false;
  const parts = storagePath.split("/");
  return parts.length >= 2
    && parts[0] === organizationId
    && parts.every((part) => part !== "" && part !== "." && part !== ".." && !part.includes("\\") && !part.includes("\0"));
}

export function isProjectDocumentStoragePath(input: {
  organizationId: string;
  projectId: string | null;
  contractId: string | null;
  storagePath: string;
}): boolean {
  const { organizationId, projectId, contractId, storagePath } = input;
  if (!isOrganizationStoragePath(organizationId, storagePath)) return false;
  const parts = storagePath.split("/");
  if (projectId && UUID.test(projectId) && parts.length === 3
      && parts[1] === projectId && /^[a-f0-9-]{36}-/i.test(parts[2])
      && SAFE_LEAF.test(parts[2])) return true;
  return Boolean(contractId && UUID.test(contractId) && parts.length === 4
    && parts[1] === "contracts" && parts[2] === contractId
    && UUID.test(parts[3]));
}

export function privateFileNameMatchesMime(fileName: string, mimeType: string): boolean {
  const extensions = MIME_EXTENSIONS[mimeType];
  return Boolean(extensions && extensions.some((ext) => fileName.toLowerCase().endsWith(ext)));
}

export function privateFileContentMatchesMime(bytes: Uint8Array, mimeType: string): boolean {
  if (!bytes.length) return false;
  const starts = (...values: number[]) => values.every((byte, index) => bytes[index] === byte);
  switch (mimeType) {
    case "application/pdf": return starts(0x25, 0x50, 0x44, 0x46, 0x2d);
    case "image/png": return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/jpeg": return starts(0xff, 0xd8, 0xff);
    case "image/webp": return starts(0x52, 0x49, 0x46, 0x46)
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return starts(0x50, 0x4b, 0x03, 0x04);
    case "application/vnd.ms-excel": return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    case "text/plain":
    case "text/csv":
    case "text/markdown":
    case "application/json":
    case "application/xml":
    case "text/xml":
      try {
        const sample = bytes.subarray(0, 8192);
        new TextDecoder("utf-8", { fatal: true }).decode(sample);
        return !sample.includes(0);
      } catch { return false; }
    default: return false;
  }
}
