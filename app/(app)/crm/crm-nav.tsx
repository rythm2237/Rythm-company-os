import Link from "next/link";
const destinations = [["/crm", "Customers", "01"], ["/crm/leads", "Leads", "02"], ["/crm/pipeline", "Sales pipeline", "03"], ["/crm/reports", "Analytics", "04"], ["/crm/settings", "Settings & data", "05"]];
export function CrmNav({active}:{active:string}) {
 return <nav className="crm-workspace-nav" aria-label="CRM navigation">{destinations.map(([href,label,number])=><Link key={href} href={href} aria-current={active===href?"page":undefined}><span aria-hidden="true">{number}</span>{label}</Link>)}</nav>;
}
