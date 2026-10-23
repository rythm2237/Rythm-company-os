import {requireOrganizationContext} from "@/lib/auth/organization-context";
import {canCrm} from "@/lib/crm/access";
import {CrmNav} from "../crm-nav";
export const dynamic="force-dynamic";
type CurrencyReport={currency:string;opportunities:number;won:number;lost:number;open_value:string;weighted_value:string;won_value:string};
export default async function Reports() {
 const {supabase,organizationId}=await requireOrganizationContext();
 // Financial reporting needs an explicit company grant; customer-scoped access remains on Customer 360/pipeline.
 const finance=await canCrm(supabase,organizationId,"finance.read");
 const {data,error}=await supabase.rpc("crm_sales_report",{p_organization_id:organizationId});
 const report=data as {currencies:CurrencyReport[];leads:number;converted_leads:number}|null;
 let auditFailed=false;
 if(finance){const result=await supabase.rpc("crm_log_sensitive_access",{p_organization_id:organizationId,p_domain:"finance",p_resource_type:"company",p_resource_id:organizationId});auditFailed=!!result.error;}
 return <main className="command-shell crm-shell"><header className="command-header"><div><h1>Sales reports</h1><p className="subtitle">Live totals from authorized records. Currencies are never added together.</p></div></header><CrmNav active="/crm/reports"/>{error||auditFailed?<p className="form-error" role="alert">Reports unavailable.</p>:<><section className="panel"><h2>Lead conversion</h2><p>{report?.converted_leads??0} converted / {report?.leads??0} total leads</p><p>{report?.leads?((report.converted_leads/report.leads)*100).toFixed(1):"0"}% converted</p><small>All-time snapshot, not a date cohort or attribution report.</small></section><section className="panel"><h2>Sales forecast</h2>{!finance?<p className="crm-restricted">Company financial reporting requires an explicit finance.read company grant.</p>:<>{!report?.currencies.length?<p>No permitted opportunities yet.</p>:null}<div className="crm-report-scroll"><table className="crm-report-table"><caption>All-time company sales by original currency</caption><thead><tr>{["Currency","Opportunities","Open value","Weighted forecast","Won value","Win rate"].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{report?.currencies.map(c=><tr key={c.currency}><th scope="row">{c.currency}</th><td>{c.opportunities}</td><td>{c.open_value}</td><td>{c.weighted_value}</td><td>{c.won_value}</td><td>{c.won+c.lost?((c.won/(c.won+c.lost))*100).toFixed(1):"0"}%</td></tr>)}</tbody></table></div><p><small>Weighted forecast = open opportunity value × probability. Win rate = won ÷ (won + lost). These are sales estimates, not recognized revenue or profit.</small></p></>}</section></>}</main>;
}
