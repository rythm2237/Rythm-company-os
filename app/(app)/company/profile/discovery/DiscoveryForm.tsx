"use client";
import { useState } from "react";
import { discoverBusiness, discoveryLimits, formatDiscoveryMission, baseDiscoveryMission } from "@/lib/business-discovery";
import { SubmitButton } from "@/components/ui/Button";

type Props = {templateKey:string; mission:string; vision:string; currency:string; timezone:string; action:(data:FormData)=>void|Promise<void>};
export default function DiscoveryForm({templateKey,mission,vision,currency,timezone,action}:Props) {
  const [draft,setDraft]=useState(()=>discoverBusiness(templateKey));
  const [description,setDescription]=useState("");
  const [purpose,setPurpose]=useState(baseDiscoveryMission(mission));
  const [goal,setGoal]=useState(vision);
  const [confirmed,setConfirmed]=useState(false);
  const change=(field:"category"|"subcategory"|"services",value:string)=>{setDraft(d=>({...d,[field]:value,basis:"Manually edited; not independently verified.",confidence:"unknown"}));setConfirmed(false);};
  return <form action={action} className="ops-form-grid" aria-label="Business discovery">
    <div style={{gridColumn:"1 / -1"}}>
      <p>Review the template-based suggestions below. Nothing is sent to an AI provider, website or analytics service. No changes are saved until you confirm.</p>
      <details><summary>Optional: describe your actual business to refine suggestions</summary>
        <label><span>Business context (used only on this page)</span><textarea value={description} maxLength={1200} rows={3} onChange={e=>setDescription(e.target.value)} placeholder="e.g. We provide SEO and content marketing"/></label>
        <button type="button" className="secondary-button" onClick={()=>{setDraft(discoverBusiness(templateKey,description));setConfirmed(false);}}>Refresh suggestions from my description</button>
        <p>Refreshing replaces the suggested category, specialization and services. Review them before saving.</p>
      </details>
    </div>
    <p className="security-note" role="status" style={{gridColumn:"1 / -1",overflowWrap:"anywhere"}}>Suggestion confidence: {draft.confidence} (match confidence, not proof of a business fact). {draft.basis}</p>
    <label><span>Business category (optional)</span><input name="category" maxLength={discoveryLimits.category} value={draft.category} onChange={e=>change("category",e.target.value)}/></label>
    <label><span>Specialization (optional)</span><input name="subcategory" maxLength={discoveryLimits.subcategory} value={draft.subcategory} onChange={e=>change("subcategory",e.target.value)}/></label>
    <label style={{gridColumn:"1 / -1"}}><span>Services actually offered (optional)</span><textarea name="services" maxLength={discoveryLimits.services} rows={2} value={draft.services} onChange={e=>change("services",e.target.value)}/></label>
    <label style={{gridColumn:"1 / -1"}}><span>Mission — review or edit</span><textarea name="mission" required maxLength={discoveryLimits.mission} rows={3} value={purpose} onChange={e=>{setPurpose(e.target.value);setConfirmed(false);}}/></label>
    <label style={{gridColumn:"1 / -1"}}><span>Vision — review or edit</span><textarea name="vision" required maxLength={discoveryLimits.vision} rows={3} value={goal} onChange={e=>{setGoal(e.target.value);setConfirmed(false);}}/></label>
    <div style={{gridColumn:"1 / -1",overflowWrap:"anywhere"}}>
      <p>Existing operating defaults: currency {currency||"not set"} · timezone {timezone||"not set"}. No location, tax, currency or timezone is inferred or changed here. <a href="/company/profile">Correct defaults or edit the full profile</a>.</p>
      <details><summary>Preview the exact mission text to be saved</summary><p style={{whiteSpace:"pre-wrap"}}>{formatDiscoveryMission(purpose,draft.category,draft.subcategory,draft.services)}</p></details>
    </div>
    <label style={{gridColumn:"1 / -1",display:"flex",alignItems:"start",gap:10}}><input type="checkbox" name="confirm" value="yes" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} style={{width:"auto",flexShrink:0}}/><span>I reviewed the assumptions and authorize saving this business profile. Blank optional fields mean unknown.</span></label>
    <div style={{gridColumn:"1 / -1",display:"flex",gap:10,flexWrap:"wrap"}}><SubmitButton className="primary-button" type="submit">Confirm &amp; save profile</SubmitButton><a className="secondary-button" href="/company/launch">Return without saving</a></div>
  </form>;
}
