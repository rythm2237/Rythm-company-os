import assert from "node:assert/strict";
import Module from "node:module";
import sharp from "sharp";
import { normalizeLogo, MAX_LOGO_BYTES } from "../lib/company-branding/image";
let currentOrg = "b2000000-0000-4000-8000-000000000001";
let owner = true, signedIn = true, rowVisible = true, saveFails = false;
let path: string | null = null, uploads = 0, writes = 0;
const removed: string[] = [];
const storage = { upload: async (p: string, bytes: Buffer) => { uploads++; assert.equal((await sharp(bytes).metadata()).format, "webp"); assert.match(p, new RegExp(`^${currentOrg}/`)); return { error: null }; }, remove: async (paths: string[]) => { removed.push(...paths); return { error: null }; }, download: async () => ({ data: new Blob(["webp"]), error: null }) };
const supabase = {
  auth: { getUser: async () => ({ data: { user: signedIn ? { id: "owner" } : null } }) },
  storage: { from: () => storage },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rowVisible ? { logo_path: path } : null, error: null }) }) }), upsert: (value: {logo_path: string|null}) => ({ select: () => ({ single: async () => { writes++; if (saveFails) return {error: "failed"}; path = value.logo_path; return {data: {organization_id: currentOrg}, error: null}; } }) }) })
};
const loader = Module as unknown as { _load: (id:string,...args:unknown[])=>unknown };
const original = loader._load;
loader._load = function(id,...args) {
 if (id === "next/cache") return { revalidatePath: () => undefined };
 if (id.includes("auth/organization-context")) return { requireOwnerOrganizationContext: async () => { if(!owner) throw new Error("OWNER_REQUIRED"); return {supabase,organizationId:currentOrg}; } };
 if (id.includes("supabase/auth-server")) return { createAuthServerClient: async () => supabase };
 return original.call(this,id,...args);
};
async function main() {
 const png=await sharp({create:{width:900,height:300,channels:4,background:{r:0,g:150,b:120,alpha:0.5}}}).png().toBuffer();
 const f = new File([new Uint8Array(png)], "logo.png", {type:"image/png"});
 const result=await normalizeLogo(f); const meta=await sharp(result).metadata();
 assert.equal(meta.width,512);assert.equal(meta.height,171);assert.equal(meta.hasAlpha,true);assert.equal(meta.exif,undefined);
 await assert.rejects(normalizeLogo(new File(["<svg></svg>"],"logo.png",{type:"image/png"})));
 await assert.rejects(normalizeLogo(new File([new Uint8Array(MAX_LOGO_BYTES+1)],"large.png")));
 const {saveCompanyLogo}=await import("../app/(app)/company/profile/logo-actions");
 const form=new FormData();form.set("organizationId",currentOrg);form.set("logo",f);
 currentOrg="b2000000-0000-4000-8000-000000000002";
 assert.match((await saveCompanyLogo({},form)).error!,/active company changed/);assert.equal(uploads,0);
 currentOrg=String(form.get("organizationId"));owner=false;
 await assert.rejects(saveCompanyLogo({},form),/OWNER_REQUIRED/);owner=true;
 assert.match((await saveCompanyLogo({},form)).message!,/updated/);const old=path;assert.equal(uploads,1);assert.equal(writes,1);
 saveFails=true;assert.match((await saveCompanyLogo({},form)).error!,/unchanged/);assert.equal(path,old);assert.equal(removed.length,1);saveFails=false;
 const {GET}=await import("../app/api/company-logo/[id]/route");const request=new Request("https://rythm-os.com/api/company-logo/"+currentOrg);const params={params:Promise.resolve({id:currentOrg})};
 signedIn=false;assert.equal((await GET(request,params)).status,401);signedIn=true;rowVisible=false;assert.equal((await GET(request,params)).status,404);rowVisible=true;
 const response=await GET(request,params);assert.equal(response.status,200);assert.match(response.headers.get("cache-control")!,/no-store/);assert.equal(response.headers.get("content-type"),"image/webp");
 form.set("intent","remove");assert.match((await saveCompanyLogo({},form)).message!,/removed/);assert.equal(path,null);assert.ok(removed.includes(old!));
 console.log("PASS logo decoding, size/type validation, alpha/resize, stale-company and owner guards, upload/save/removal, failed-save cleanup, private delivery and auth");
}
main().finally(()=>{loader._load=original;}).catch(e=>{console.error(e);process.exitCode=1;});
