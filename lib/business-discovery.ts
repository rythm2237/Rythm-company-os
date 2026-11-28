// W19: local, deterministic suggestions, never verified business facts.
const agency = "ready_ai_advertising_agency_v1";
const software = "ready_software_company_v1";
const signals = [
  { name: "Search engine optimization", family: "SEO agency", pattern: /\b(seo|search engine optimization)\b/i },
  { name: "Paid advertising", family: "Performance marketing agency", pattern: /\b(ppc|paid ads|paid advertising|performance marketing)\b/i },
  { name: "Brand and design", family: "Creative agency", pattern: /\b(branding|graphic design|brand design)\b/i },
  { name: "Content and social media", family: "Content agency", pattern: /\b(content marketing|social media|copywriting)\b/i },
  { name: "Web development", family: "Digital agency", pattern: /\b(web development|website development|web design)\b/i },
  { name: "Software development", family: "Software development", pattern: /\b(software development|application development|saas)\b/i },
] as const;
export type DiscoveryDraft = {category:string; subcategory:string; services:string; basis:string; confidence:"high"|"medium"|"unknown"};
export function discoverBusiness(templateKey: string, context = ""): DiscoveryDraft {
  const input = context.slice(0,1200);
  // Match positive, short clauses; uncertain/negative clauses are not evidence.
  const clauses = input.split(/[;,\n.!?]+/).filter(s=>! /\b(no|not|never|don't|doesn't|without|maybe|might|considering|exclude)\b/i.test(s));
  const matches = signals.filter(s=>clauses.some(c=>s.pattern.test(c)));
  const advertising = templateKey===agency;
  const engineering = templateKey===software;
  const relevant = matches.filter(s=>engineering ? s.family==="Software development"||s.family==="Digital agency" : advertising ? s.family!=="Software development" : true);
  const conflicting = matches.length!==relevant.length || (!advertising&&!engineering&&matches.some(s=>s.family==="Software development")&&matches.some(s=>s.family!=="Software development"&&s.family!=="Digital agency"));
  const hasSoftware = matches.some(s=>s.family==="Software development");
  const hasMarketing = matches.some(s=>s.family!=="Software development"&&s.family!=="Digital agency");
  const contextualCategory = hasSoftware&&!hasMarketing ? "Software and technology" : hasMarketing&&!hasSoftware ? "Advertising and marketing" : "";
  const category = advertising ? "Advertising and marketing" : engineering ? "Software and technology" : contextualCategory;
  const families = [...new Set(relevant.map(s=>s.family))];
  return {
    category,
    subcategory: !conflicting&&families.length===1&&Boolean(category) ? families[0] : "",
    services: !conflicting ? relevant.map(s=>s.name).join(", ") : "",
    basis: conflicting ? "Context conflicts with the installed template. Review manually; no services assumed." : relevant.length ? "Possible matches in your supplied description; confirm or remove each." : category ? "Installed template category only; actual services and specialization are unknown." : "No recognized installed template. Enter the category only if known.",
    confidence: conflicting ? "unknown" : relevant.length ? "medium" : category ? "high" : "unknown",
  };
}
export const discoveryLimits = { mission: 2000, vision: 2000, category: 120, subcategory: 120, services: 500 } as const;
const marker = "\n\nBusiness discovery (owner confirmed):\n";
export function parseDiscoveryMission(mission:string) {
  const index=mission.lastIndexOf(marker);
  const empty={mission,category:"",subcategory:"",services:""};
  if(index<0) return empty;
  const rows=mission.slice(index+marker.length).split("\n");
  const fields:Record<string,string>={};
  for(const row of rows) {
    const match=/^(Category|Specialization|Services): (.+)$/.exec(row);
    if(!match||Object.hasOwn(fields,match[1])) return empty;
    fields[match[1]]=match[2];
  }
  return {mission:mission.slice(0,index),category:fields.Category??"",subcategory:fields.Specialization??"",services:fields.Services??""};
}
export function baseDiscoveryMission(mission:string) { return parseDiscoveryMission(mission).mission; }
export function formatDiscoveryMission(mission:string, category:string, subcategory:string, services:string) {
  const fields = [["Category",category],["Specialization",subcategory],["Services",services]].filter(([,v])=>v.trim()).map(([k,v])=>k+": "+v.trim().replace(/[\r\n]+/g," "));
  return baseDiscoveryMission(mission).trim()+(fields.length?marker+fields.join("\n"):"");
}
export function validateDiscovery(form:FormData) {
  const fields = Object.fromEntries(Object.entries(discoveryLimits).map(([key])=>[key,typeof form.get(key)==="string"?String(form.get(key)).trim():""])) as Record<keyof typeof discoveryLimits,string>;
  if(form.get("confirm")!=="yes"||!baseDiscoveryMission(fields.mission).trim()||!fields.vision||Object.entries(discoveryLimits).some(([key,max])=>fields[key as keyof typeof discoveryLimits].length>max)) return null;
  return {...fields, mission:formatDiscoveryMission(fields.mission,fields.category,fields.subcategory,fields.services)};
}
