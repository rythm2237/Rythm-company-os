import Link from "next/link";
export function CrmNav({active}:{active:string}) {
 return <nav className="crm-toolbar" aria-label="CRM navigation">{[["/crm","Customers"],["/crm/leads","Leads"],["/crm/pipeline","Sales pipeline"],["/crm/reports","Sales reports"],["/crm/settings","CRM settings & import"]].map(([href,label])=><Link key={href} href={href} aria-current={active===href?"page":undefined} className={active===href?"primary-button":"secondary-button"}>{label}</Link>)}</nav>;
}
