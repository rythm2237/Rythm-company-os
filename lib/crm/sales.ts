export const LEAD_STATUSES = ["new", "assigned", "qualifying", "qualified", "disqualified"] as const;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const LEAD_FIELDS = "id,name,company_name,email,phone,source,status,owner_user_id,next_follow_up_at,qualification_notes,converted_customer_id,converted_at,updated_at";
export type SalesStage = { code: string; name: string; probability: number; is_closed: boolean; is_won: boolean };
export type SalesOpportunity = { id: string; account_id: string; name: string; stage_code: string; value: number; currency: string; probability: number; version: number; expected_close_date: string | null; owner_user_id: string | null; lost_reason: string | null };
export function leadInput(input: Record<string, unknown>) {
 const str=(key:string,max:number)=>{const v=input[key];if(v!=null&&typeof v!=="string")throw new Error("Invalid lead fields");if(String(v??"").length>max)throw new Error("Lead field too long");return String(v??"").trim();};
 const name=str("name",240),status=str("status",30)||"new",email=str("email",320).toLowerCase()||null,owner=str("owner_user_id",36)||null,follow=str("next_follow_up_at",40)||null;
 if(!name||!LEAD_STATUSES.includes(status as typeof LEAD_STATUSES[number])||owner&&!UUID.test(owner)||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||follow&&!Number.isFinite(Date.parse(follow)))throw new Error("Check name, status, email, assignee and follow-up date.");
 return {name,status,email,owner_user_id:owner,next_follow_up_at:follow?new Date(follow).toISOString():null,company_name:str("company_name",240)||null,phone:str("phone",100)||null,source:str("source",100)||"manual",qualification_notes:str("qualification_notes",4000)||null};
}
export function customProperties(value: string): Record<string, string | number | boolean | null> {
 const parsed:unknown=JSON.parse(value||"{}");
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||value.length>8192)throw new Error("Use a JSON object up to 8 KB.");
 const entries=Object.entries(parsed);
 if(entries.length>40||entries.some(([key,v])=>!key||key.length>80||v!==null&&!["string","number","boolean"].includes(typeof v)||typeof v==="string"&&v.length>1000))throw new Error("Use up to 40 simple operational properties.");
 return parsed as Record<string,string|number|boolean|null>;
}
export function csvCell(value: unknown): string {
 let text=String(value??"");if(/^[\s\u0000-\u001f]*[=+\-@]/.test(text))text="'"+text;
 return `"${text.replaceAll('"','""')}"`;
}
export function customerCsv(rows: Array<Record<string,unknown>>) {
 const fields=["id","name","account_type","customer_status","email","phone","industry","country_code","source"];
 return "\uFEFF"+[fields.map(csvCell).join(","),...rows.map(row=>fields.map(key=>csvCell(row[key])).join(","))].join("\r\n");
}
