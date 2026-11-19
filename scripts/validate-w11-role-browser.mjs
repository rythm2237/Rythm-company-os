import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Browser + actual local Auth/PostgREST, no mocks and no production endpoints.
// Called only from the W10 disposable Supabase journey, after its synthetic
// company is fully provisioned. All accounts and records are thrown away.
export async function verifyW11RoleBrowser({
  browser, ownerPage, admin, memberClient, memberEmail, memberPassword,
  memberId, ownerId, organizationId, customerId, customerName, contractId,
  contractNumber, projectId, profile,
}) {
  const app = "http://localhost:3000";
  const backend = "http://127.0.0.1:54321";
  const marker = "W11-PRIVATE-" + randomUUID();
  const financeReference = "W11-INVOICE-" + randomUUID();
  const evidence = {profile,checks:[],synthetic_only:true,provider_requests:0};
  const ok = (value, label) => {
    assert.ok(!value.error, label + ": " + (value.error?.code ?? value.error?.status ?? "unknown"));
    return value.data;
  };
  const check = (condition,label) => {assert.ok(condition,label); evidence.checks.push(label);};
  const context = await browser.newContext({ viewport: {width:1280,height:900}, acceptDownloads:false });
  context.setDefaultTimeout(30000);
  await context.route("**/*", route => {
    const u = new URL(route.request().url());
    return u.origin === app || u.origin === backend ? route.continue() : route.abort();
  });
  const viewer = await context.newPage();
  const customerPath = "/crm/" + customerId;

  async function grant(principalType,principalId,capability,scope,resourceId){
    await ownerPage.goto(app + "/crm/access");
    await ownerPage.getByRole("heading",{name:"Grant user access"}).waitFor();
    if(principalType==="agent")await ownerPage.locator("details").filter({has:ownerPage.getByText("Grant agent access")}).first().locator("summary").click();
    const form=ownerPage.locator("form").filter({has:ownerPage.locator('input[name="principal_type"][value="'+principalType+'"]')});
    await form.locator('select[name="principal_id"]').selectOption(principalId);
    await form.locator('select[name="capability"]').selectOption(capability);
    await form.locator('select[name="resource_type"]').selectOption(scope);
    await form.locator('input[name="resource_id"]').fill(resourceId);
    await form.getByRole("button",{name:"Grant explicit access"}).click();
    await ownerPage.waitForURL(url=>url.pathname==="/crm/access"&&url.searchParams.get("saved")==="1");
    const rows=ok(await admin.from("crm_access_grants").select("id,revoked_at")
      .eq("organization_id",organizationId).eq("principal_type",principalType)
      .eq("principal_id",principalId).eq("capability",capability)
      .eq("resource_type",scope).eq("resource_id",resourceId).is("revoked_at",null),
      "Inspect exact scoped grant");
    assert.equal(rows.length,1,"One active scoped grant expected");
    return rows[0].id;
  }
  async function revoke(grantId) {
    await ownerPage.goto(app+"/crm/access");
    const form=ownerPage.locator("form").filter({has:ownerPage.locator('input[name="id"][value="'+grantId+'"]')});
    await form.getByRole("button",{name:"Revoke"}).click();
    await ownerPage.waitForURL(url=>url.pathname==="/crm/access"&&url.searchParams.get("saved")==="1");
    check(Boolean(ok(await admin.from("crm_access_grants").select("revoked_at")
      .eq("organization_id",organizationId).eq("id",grantId).single(),"Inspect revoked grant").revoked_at),
      "revoke persisted in PostgreSQL");
  }
  async function browserText(url) {
    const response = await viewer.goto(app+url);
    assert.ok(response?.ok(),"Browser navigation "+url+" returned "+response?.status());
    return viewer.locator("body").innerText();
  }
  try {
    await viewer.goto(app+"/login?force=1&next="+encodeURIComponent(customerPath));
    await viewer.locator('[name="email"]').fill(memberEmail);
    await viewer.locator('[name="password"]').fill(memberPassword);
    await viewer.getByRole("button",{name:"Sign in",exact:true}).click();
    await viewer.waitForURL(url=>url.pathname!=="/login"&&url.pathname!=="/login/",{timeout:45000});
    const initial = await browserText(customerPath+"?tab=contracts");
    check(initial.includes("This section requires explicit authorization"),"viewer contract page initially restricted");
    check(!initial.includes(contractNumber),"viewer contract number absent from HTML");

    const originalFinance = await browserText(customerPath+"?tab=finance");
    check(originalFinance.includes("This section requires explicit authorization"),"viewer finance page initially restricted");
    const originalReport = await browserText("/crm/reports");
    check(originalReport.includes("Company financial reporting requires an explicit finance.read company grant"),"viewer forecast dashboard restricted");

    const beforeExport = await viewer.request.get(app+"/api/crm/customers/export?page=1",{maxRedirects:0});
    check(beforeExport.status()===403,"viewer real HTTP CSV export denied 403");
    const privacyExport = await viewer.request.get(app+"/api/privacy/export?organizationId="+organizationId,{maxRedirects:0});
    check(privacyExport.status()===403,"viewer organization privacy export denied 403");
    const ownerExport = await ownerPage.request.get(app+"/api/crm/customers/export?page=1");
    check(ownerExport.status()===200,"owner CSV export HTTP 200");
    const exported=await ownerExport.text();
    check(exported.includes(customerName),"owner CSV export contains authorized customer");
    check(!exported.includes(contractNumber),"owner operational CSV excludes contract data");

    const invoice = ok(await admin.from("finance_invoices").insert({
      organization_id: organizationId, customer_id:customerId, project_id:projectId,
      contract_id:contractId, internal_reference:financeReference,
      customer_name:"Synthetic W11 Client",total:321.45,currency:"EUR",status:"draft",
    }).select("id").single(),"Create synthetic invoice in disposable staging");
    // The sales pipeline is another finance dashboard and must remain RLS-filtered.
    let stages=ok(await admin.from("crm_pipeline_stages").select("code")
      .eq("organization_id",organizationId).order("sequence_no").limit(1),"Read synthetic sales stages");
    if(!stages.length){
      const stage=ok(await admin.from("crm_pipeline_stages").insert({
        organization_id:organizationId,code:"qualified",name:"Qualified",sequence_no:20,
        probability:25,is_closed:false,is_won:false,
      }).select("code").single(),"Seed missing sales stage in isolated organization");
      stages=[stage];
    }
    ok(await admin.from("crm_opportunities").insert({
      organization_id:organizationId,account_id:customerId,name:marker,
      stage_code:stages[0].code,value:98765,currency:"EUR",probability:50,
    }).select("id").single(),"Create synthetic restricted opportunity");
    const directInvoice = ok(await memberClient.from("finance_invoices").select("id").eq("id",invoice.id),
      "Viewer invoice RLS without grant");
    check(directInvoice.length===0,"viewer cannot query invoice through real PostgREST");
    const secretFree = await browserText("/crm?q="+encodeURIComponent(financeReference));
    check(!secretFree.includes(financeReference),"customer directory/search has no invoice identifier");
    const hiddenInvoiceText=await browserText(customerPath+"?tab=finance");
    check(!hiddenInvoiceText.includes(financeReference),"viewer finance HTML excludes invoice identifier");
    const hiddenPipeline=await browserText("/crm/pipeline");
    check(!hiddenPipeline.includes(marker),"viewer pipeline hides restricted opportunity");
    const hiddenForecastText=await browserText("/crm/reports");
    check(!hiddenForecastText.includes(marker)&&hiddenForecastText.includes("Company financial reporting requires"),
      "viewer dashboard cannot reveal financial values");

    const memberContractGrant=await grant("user",memberId,"contract.read","customer",customerId);
    const grantedContracts=ok(await memberClient.from("project_contracts").select("id").eq("id",contractId),
      "Viewer contract after explicit grant");
    check(grantedContracts.length===1,"customer-scoped contract.read makes only permitted contract available");
    const permittedContractPage=await browserText(customerPath+"?tab=contracts");
    check(permittedContractPage.includes(contractNumber),"viewer browser sees allowed contract after explicit grant");
    await revoke(memberContractGrant);
    check(ok(await memberClient.from("project_contracts").select("id").eq("id",contractId),
      "Viewer contract after revoke").length===0,"revoked contract.read immediately removes PostgREST visibility");
    const revokedContractPage=await browserText(customerPath+"?tab=contracts");
    check(!revokedContractPage.includes(contractNumber),"revoked contract not leaked in refreshed HTML");

    const memberFinanceGrant=await grant("user",memberId,"finance.read","customer",customerId);
    const allowedInvoices=ok(await memberClient.from("finance_invoices").select("id").eq("id",invoice.id),"Viewer finance grant");
    check(allowedInvoices.length===1,"customer-scoped finance.read exposes only allowed invoice");
    const grantedPipeline=await browserText("/crm/pipeline");
    check(grantedPipeline.includes(marker),"customer finance grant reveals only authorized pipeline item");
    const allowedFinance=await browserText(customerPath+"?tab=finance");
    check(allowedFinance.includes(financeReference),"viewer browser sees explicitly permitted invoice");
    const scopedReport=await browserText("/crm/reports");
    check(scopedReport.includes("Company financial reporting requires"),"customer-scoped finance grant never unlocks company-wide dashboard");
    await revoke(memberFinanceGrant);
    check(ok(await memberClient.from("finance_invoices").select("id").eq("id",invoice.id),
      "Viewer finance after revoke").length===0,"revoked finance.read immediately removes PostgREST invoice");
    const revokedPipeline=await browserText("/crm/pipeline");
    check(!revokedPipeline.includes(marker),"revoked finance removes opportunity from pipeline");
    const revokedFinance=await browserText(customerPath+"?tab=finance");
    check(!revokedFinance.includes(financeReference),"revoked finance invoice absent from HTML");
    check((await viewer.request.get(app+"/api/crm/customers/export")).status()===403,
      "CSV export stays denied after permission changes");

    // Agent access is *not* equivalent to a human user's grant.
    // Evaluate the existing service-only agent-context RPC against real ACLs.
    const agents=ok(await admin.from("agents").select("id").eq("organization_id",organizationId)
      .eq("enabled",true).neq("agent_code","RYTHM-COMMS").limit(1),"Find enabled synthetic Agency agent");
    check(agents.length===1,"agent test uses enabled same-tenant specialist");
    const agentId=agents[0].id;
    const unauthorizedAgent = await admin.rpc("crm_agent_customer_context",{
      p_organization_id:organizationId,p_customer_id:customerId,p_agent_id:agentId,p_user_id:ownerId,
      p_include_contracts:true,p_include_finance:true,
    });
    check(Boolean(unauthorizedAgent.error),"agent with no domain grants cannot retrieve sensitive context");
    const agentCustomer=await grant("agent",agentId,"customer.read","customer",customerId);
    const agentContract=await grant("agent",agentId,"contract.read","customer",customerId);
    const permittedAgent=ok(await admin.rpc("crm_agent_customer_context",{
      p_organization_id:organizationId,p_customer_id:customerId,p_agent_id:agentId,p_user_id:ownerId,
      p_include_contracts:true,p_include_finance:false,
    }),"Read explicitly permitted agent contracts");
    check(permittedAgent.contracts.some(c=>c.id===contractId),"approved agent and initiating Owner jointly authorize contract context");
    const withoutFinance=await admin.rpc("crm_agent_customer_context",{
      p_organization_id:organizationId,p_customer_id:customerId,p_agent_id:agentId,p_user_id:ownerId,
      p_include_contracts:true,p_include_finance:true,
    });
    check(Boolean(withoutFinance.error),"agent cannot elevate contract grant to finance");
    const agentFinance=await grant("agent",agentId,"finance.read","customer",customerId);
    const withoutHumanFinance=await admin.rpc("crm_agent_customer_context",{
      p_organization_id:organizationId,p_customer_id:customerId,p_agent_id:agentId,p_user_id:memberId,
      p_include_contracts:false,p_include_finance:true,
    });
    check(Boolean(withoutHumanFinance.error),"agent grant cannot bypass initiating viewer missing finance permission");
    const ownerFinance=await grant("user",ownerId,"finance.read","customer",customerId);
    const permittedFinanceAgent=ok(await admin.rpc("crm_agent_customer_context",{
      p_organization_id:organizationId,p_customer_id:customerId,p_agent_id:agentId,p_user_id:ownerId,
      p_include_contracts:true,p_include_finance:true,
    }),"Read doubly authorized agent finance");
    check(permittedFinanceAgent.invoices.some(i=>i.id===invoice.id),"agent and human both explicitly authorize finance context");
    await revoke(agentFinance);
    const afterAgentRevoke=await admin.rpc("crm_agent_customer_context",{
      p_organization_id:organizationId,p_customer_id:customerId,p_agent_id:agentId,p_user_id:ownerId,
      p_include_contracts:false,p_include_finance:true,
    });
    check(Boolean(afterAgentRevoke.error),"revoked agent finance grant fails closed");
    await revoke(ownerFinance);
    await revoke(agentContract);
    await revoke(agentCustomer);

    const finalReport=await browserText("/crm/reports");
    check(finalReport.includes("Company financial reporting requires"),"viewer company report stays restricted after grant/revoke sequence");
    console.log("PASS W11 real Auth/browser/RLS: "+evidence.checks.length+" synthetic role/export/forecast/agent checks ("+profile+")");
    return evidence;
  } finally {
    await context.close();
  }
}
