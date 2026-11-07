import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isOrganizationStoragePath, isProjectDocumentStoragePath,
  privateFileNameMatchesMime, privateFileContentMatchesMime
} from "../lib/security/private-file-validation.ts";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const PROJECT_A = "33333333-3333-4333-8333-333333333333";
const CONTRACT_A = "44444444-4444-4444-8444-444444444444";
const FILE_ID = "55555555-5555-4555-8555-555555555555";
const check = (path, projectId=PROJECT_A, contractId=null, organizationId=ORG_A) =>
  isProjectDocumentStoragePath({organizationId, projectId, contractId, storagePath:path});
assert.equal(check(`${ORG_A}/${PROJECT_A}/${FILE_ID}-contract.pdf`), true);
assert.equal(check(`${ORG_A}/contracts/${CONTRACT_A}/${FILE_ID}`, null, CONTRACT_A), true);
assert.equal(check(`${ORG_B}/${PROJECT_A}/${FILE_ID}-contract.pdf`), false, "foreign object key");
assert.equal(check(`${ORG_A}/${CONTRACT_A}/${FILE_ID}-contract.pdf`), false, "wrong project key");
assert.equal(check(`${ORG_A}/contracts/${CONTRACT_A}/${FILE_ID}`, null, null), false, "contract missing");
assert.equal(check(`${ORG_A}/../${ORG_B}/${FILE_ID}`), false, "traversal");
assert.equal(isOrganizationStoragePath(ORG_A, `${ORG_A}//file`), false);
assert.equal(isOrganizationStoragePath(ORG_A, `${ORG_B}/file`), false);
assert.equal(privateFileNameMatchesMime("contract.pdf","application/pdf"), true);
assert.equal(privateFileNameMatchesMime("contract.html","application/pdf"), false);
assert.equal(privateFileContentMatchesMime(new TextEncoder().encode("%PDF-1.7\n"),"application/pdf"), true);
assert.equal(privateFileContentMatchesMime(new TextEncoder().encode("<script>alert(1)</script>"),"application/pdf"), false);
assert.equal(privateFileContentMatchesMime(new Uint8Array([0x50,0x4b,0x03,0x04,0x00]),"application/vnd.openxmlformats-officedocument.wordprocessingml.document"), true);
assert.equal(privateFileContentMatchesMime(new Uint8Array([0x00,0x41]),"text/plain"), false);
assert.equal(privateFileContentMatchesMime(new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),"image/png"), true);
const migration = readFileSync(new URL("../supabase/migrations/20261107060000_w05_file_confidentiality.sql",import.meta.url), "utf8");
assert.match(migration, /storage\.allow_any_operation/);
assert.match(migration, /object\.sign_many/);
assert.match(migration, /project_document_storage_boundary/);
console.log("W05 local security guards: assertions PASS (storage key, tenant, contract, MIME, URL-signing policy).");
