import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync,writeFileSync } from "node:fs";
import { buildW03Blueprint } from "./w03-blueprint.mjs";

// This is a real-JWT, staging-only security test. Never aim this at Production.
const STAGING_REF="viqjdgohtxqkrdgwtull";
const url=process.env.W03_STAGING_SUPABASE_URL;
assert.equal(process.env.GITHUB_ACTIONS,"true");
assert.equal(process.env.W03_STAGING_REF,STAGING_REF);
assert.equal(url,"https://"+STAGING_REF+".supabase.co");
assert.equal(process.env.W03_W01_VERIFIED,"true");
assert.notEqual(process.env.VERCEL_ENV,"production");
assert.equal(process.env.RYTHM_EXTERNAL_ACTIONS_ENABLED,"false");
const secret=process.env.W03_STAGING_SERVICE_ROLE_KEY, anon=process.env.W03_STAGING_ANON_KEY;
assert.ok(secret&&anon&&process.env.W03_TEST_PASSWORD?.length>=16);
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,secret,options);
const b=buildW03Blueprint();
const companyA=b.companies.find(x=>x.key==="A"),companyB=b.companies.find(x=>x.key==="B");
assert.ok(companyA&&companyB);
const testCustomer=randomUUID(),anotherCustomer=randomUUID();
const acceptedContract=randomUUID(),ungrantedContract=randomUUID(),foreignContract=randomUUID(),noRoleContract=randomUUID();
const grantIds=[randomUUID(),randomUUID()];
const checks=[];
const pass=name=>checks.push({name,passed:true});
const unwrap=(r,label)=>{if(r.error)throw Error(label+":"+(r.error.code??"unknown"));return r.data;};
async function login(key){
  const user=b.users.find(x=>x.key===key);assert.ok(user);
  const client=createClient(url,anon,options);
  const data=unwrap(await client.auth.signInWithPassword({email:user.email,password:process.env.W03_TEST_PASSWORD}),"login-"+key);
  assert.ok(data.session?.access_token,"Must use real signed-in JWT");
  const org=key.startsWith("B_")?companyB:companyA;
  unwrap(await client.rpc("set_active_organization",{target_org_id:org.id}),"active-"+key);
  return {client,user:data.user};
}
let actors=[];
try{
  const owner=await login("A_owner");
  const operator=await login("A_member");
  const noGrant=await login("A_admin");
  const foreign=await login("B_member");
  actors=[owner,operator,noGrant,foreign];

  unwrap(await owner.client.from("crm_accounts").insert([
    {id:testCustomer,organization_id:companyA.id,name:"W06 TEST synthetic scoped customer"},
    {id:anotherCustomer,organization_id:companyA.id,name:"W06 TEST synthetic ungranted customer"},
  ]),"seed staged customers");

  const grants=["contract.create","contract.read"].map((capability,i)=>({
    id:grantIds[i],organization_id:companyA.id,principal_type:"user",
    principal_id:operator.user.id,capability,resource_type:"customer",
    resource_id:testCustomer,granted_by:owner.user.id,
  }));
  unwrap(await owner.client.from("crm_access_grants").insert(grants),"grant exact synthetic A-customer");

  const scoped=unwrap(await operator.client.rpc("crm_can",{
    p_organization_id:companyA.id,p_capability:"contract.create",
    p_resource_type:"customer",p_resource_id:testCustomer,
  }),"scoped grant");
  assert.equal(scoped,true);pass("A operator has explicit grant only for customer A1");

  const created=await operator.client.from("project_contracts").insert({
    id:acceptedContract,organization_id:companyA.id,customer_id:testCustomer,
    contract_number:"W06-A-SCOPED-"+randomUUID(),contract_status:"draft",contract_value:1,
  });
  assert.equal(created.error,null,"Customer-scoped create must be permitted by W06 RLS policy");
  pass("A operator real JWT permits customer-scoped contract INSERT");

  const own=unwrap(await operator.client.from("project_contracts").select("id").eq("id",acceptedContract),"scoped contract SELECT");
  assert.equal(own?.length,1);pass("A operator customer-scoped contract read allowed");

  const fRead=unwrap(await foreign.client.from("project_contracts").select("id").eq("id",acceptedContract),"foreign read");
  assert.equal(fRead?.length,0);pass("B actor cannot read A contract");

  const denied=await foreign.client.from("project_contracts").insert({
    id:foreignContract,organization_id:companyA.id,customer_id:testCustomer,
    contract_number:"W06-FORGED-"+randomUUID(),contract_status:"draft",contract_value:1,
  });
  assert.equal(denied.error?.code,"42501","B actor must be denied by INSERT RLS");
  pass("B actor foreign contract insert rejected with 42501");

  const ung=await operator.client.from("project_contracts").insert({
    id:ungrantedContract,organization_id:companyA.id,customer_id:anotherCustomer,
    contract_number:"W06-UNGRANTED-"+randomUUID(),contract_status:"draft",contract_value:1,
  });
  assert.equal(ung.error?.code,"42501","A operator cannot create for unrelated A customer");
  pass("Customer-specific grant cannot be reused for another A customer");

  const nonOwner=await noGrant.client.from("project_contracts").insert({
    id:noRoleContract,organization_id:companyA.id,customer_id:testCustomer,
    contract_number:"W06-NOGRANT-"+randomUUID(),contract_status:"draft",contract_value:1,
  });
  assert.equal(nonOwner.error?.code,"42501","A admin without explicit contract grant must be denied");
  pass("A executive without scoped contract grant rejected");

  const foreignClaim=unwrap(await foreign.client.rpc("crm_can",{
    p_organization_id:companyA.id,p_capability:"contract.create",
    p_resource_type:"customer",p_resource_id:testCustomer,
  }),"foreign-grant-check");
  assert.equal(foreignClaim,false);pass("Foreign JWT cannot claim A customer permission");

  const post=unwrap(await admin.from("project_contracts").select("id").in("id",[
    acceptedContract,foreignContract,ungrantedContract,noRoleContract,
  ]),"post-state");
  assert.equal(post.length,1);assert.equal(post[0].id,acceptedContract);
  pass("Admin post-state shows exactly one authorized contract");
}finally{
  const deletions=[
    ["project_contracts",[acceptedContract,ungrantedContract,foreignContract,noRoleContract]],
    ["crm_access_grants",grantIds],
    ["crm_accounts",[testCustomer,anotherCustomer]],
  ];
  const cleanupErrors=[];
  for(const [table,ids] of deletions){
    const r=await admin.from(table).delete().in("id",ids);
    if(r.error)cleanupErrors.push(table+":"+(r.error.code??"unknown"));
  }
  for(const a of actors)await a.client.auth.signOut().catch(()=>undefined);
  if(cleanupErrors.length)throw Error("W06 staging cleanup failed: "+cleanupErrors.join(","));
}
mkdirSync(".w03-evidence",{recursive:true});
writeFileSync(".w03-evidence/w06-crm-contract.json",JSON.stringify({
  stageRef:STAGING_REF,run:process.env.GITHUB_RUN_ID,checks,passed:checks.length,
  externalProviderCalls:0,productionWrites:0,fixtureCleanup:"SUCCESS",
},null,2)+"\n");
console.log("PASS W06 real-JWT scoped CRM contract policy",JSON.stringify({checks:checks.length,passed:checks.length,fixtureCleanup:true}));
