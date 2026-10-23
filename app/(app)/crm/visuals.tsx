/** Server-rendered charts: the visible labels are also the accessible data representation. */
export function RelationshipChart({counts}:{counts:Record<string,number>}) {
 const rows=["contacts","projects","contracts","opportunities","invoices"].map(key=>({label:key,value:Math.max(0,Number(counts[key])||0)}));
 const max=Math.max(1,...rows.map(r=>r.value));
 return <figure className="crm-chart"><figcaption>Connected records <span>Authorized records · current snapshot</span></figcaption>{rows.some(r=>r.value>0)?<div className="crm-bars">{rows.map(r=><div className="crm-bar-row" key={r.label}><span>{r.label}</span><div className="crm-bar-track" aria-hidden="true"><div style={{width:`${r.value/max*100}%`}}/></div><strong>{r.value}</strong></div>)}</div>:<p className="empty-state">No connected records yet. Add a contact or link a project to begin building this relationship.</p>}</figure>;
}
export function ConversionChart({total,converted}:{total:number;converted:number}) {
 const percent=total?Math.min(100,Math.max(0,converted/total*100)):0;
 return <div className="crm-conversion"><div className="crm-donut" style={{background:`conic-gradient(#5267d9 ${percent}%, #e9edf5 0)`}} aria-hidden="true"><div><strong>{percent.toFixed(1)}%</strong><span>converted</span></div></div><div><p className="eyebrow">Lead performance</p><h3>{converted} converted leads</h3><p>{total} total leads · {Math.max(0,total-converted)} not converted</p><small>{total?"All-time snapshot, not a date cohort or attribution report.":"Add and qualify leads to start tracking conversion."}</small></div></div>;
}
export function ForecastChart({currency,open,weighted,won}:{currency:string;open:number;weighted:number;won:number}) {
 const rows=[{label:"Open pipeline",value:open},{label:"Weighted forecast",value:weighted},{label:"Closed won",value:won}];
 const max=Math.max(1,...rows.map(r=>r.value));
 const format=(n:number)=>new Intl.NumberFormat("en-IE",{style:"currency",currency:/^[A-Z]{3}$/.test(currency)?currency:"EUR",maximumFractionDigits:0}).format(n);
 return <figure className="crm-chart"><figcaption>{currency} <span>Sales estimates · original currency</span></figcaption><div className="crm-bars">{rows.map(r=><div className="crm-bar-row crm-bar-money" key={r.label}><span>{r.label}</span><div className="crm-bar-track" aria-hidden="true"><div style={{width:`${Math.max(0,r.value)/max*100}%`}}/></div><strong>{format(r.value)}</strong></div>)}</div></figure>;
}
