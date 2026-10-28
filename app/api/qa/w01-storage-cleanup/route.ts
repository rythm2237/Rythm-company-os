import { resolveOrganizationContext } from "@/lib/auth/organization-context";
import { inspectW01Boundary } from "@/lib/qa/w01-boundary";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
const org = "f0200000-0000-4000-8000-000000000028";
const owner = "4c254c10-8e38-4971-9059-3218a36195bc";
const documentId = "6afdd4cf-4970-4ee0-838a-7283c14db254";
const path = org + "/contracts/915c10d3-f4b8-460d-bedd-f037ad1e8f39/34f0fff4-6476-46fd-a7c5-f67add8857b2";
const headers = { "Cache-Control": "no-store", "Content-Type": "text/html; charset=utf-8" };
async function allowed() {
 const report = inspectW01Boundary(process.env);
 if (!report) return false;
 const controls = Object.entries(report.controls).filter(([key]) => key !== "privileged_backend_disabled");
 if (!controls.every(([, value]) => value)) return false;
 const context = await resolveOrganizationContext();
 return context?.organizationId === org && context.user.id === owner;
}
export async function GET() {
 if (!await allowed()) return new Response("Not found", { status: 404 });
 return new Response('<h1>W01 synthetic storage cleanup</h1><p>Remove only the 140-byte W01 synthetic contract attachment from staging.</p><form method="post"><button>Remove W01 test attachment</button></form>', { headers });
}
export async function POST(request: Request) {
 if (!await allowed()) return new Response("Not found", { status: 404 });
 if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
 const service = createServerSupabaseClient();
 if (!service) return new Response("Unavailable", { status: 503 });
 const { data, error } = await service.from("project_documents").select("id,storage_path,file_name,byte_size").eq("organization_id", org).eq("id", documentId).maybeSingle();
 if (error || !data || data.storage_path !== path || data.file_name !== "w01-synthetic-contract.txt" || data.byte_size !== 140) return new Response("Fixture mismatch", { status: 409 });
 const removed = await service.storage.from("project-files").remove([path]);
 if (removed.error) return new Response("Storage cleanup failed", { status: 503 });
 const deleted = await service.from("project_documents").delete().eq("organization_id", org).eq("id", documentId);
 if (deleted.error) return new Response("Metadata cleanup failed", { status: 503 });
 return new Response("<h1>W01_TEST_ATTACHMENT_REMOVED</h1><p>The exact synthetic storage object and document record were removed.</p>", { headers });
}
