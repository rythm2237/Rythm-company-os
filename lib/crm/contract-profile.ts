/** Deterministic extraction of explicitly labelled CUSTOMER identity, never contract terms. */
export const PROFILE_LABELS = {
 name:"Display name", legal_name:"Legal name", registration_number:"Registration number", vat_number:"VAT / tax number",
 email:"Email",phone:"Phone",address:"Business address",billing_address:"Billing address",country_code:"Country code",website_url:"Website",
} as const;
export type ProfileField=keyof typeof PROFILE_LABELS;
export type ProfileSuggestion={document_id:string;sha256:string;extractor:string;created_at:string;fields:Partial<Record<ProfileField,string>>};
const aliases:Record<ProfileField,string[]>={
 name:["name","company name","نام","نام شرکت","név"],legal_name:["legal name","legal company name","نام قانونی"],
 registration_number:["registration number","company registration number","شماره ثبت","cégjegyzékszám"],vat_number:["vat number","tax number","vat","شناسه مالیاتی","کد اقتصادی","adószám"],
 email:["email","email address","ایمیل","e-mail"],phone:["phone","telephone","تلفن","تلفن همراه","telefonszám"],
 address:["address","business address","آدرس","نشانی","cím"],billing_address:["billing address","نشانی صورتحساب","számlázási cím"],country_code:["country code","کد کشور"],website_url:["website","وبسایت","وب‌سایت","honlap"],
};
const prefix=/^(?:customer|client|buyer|مشتری|کارفرما|ügyfél)(?=\s|[:：]|$)(?:\s+(?:profile|details|information|adatai))?\s*[:：]?\s*/i;
export function suggestContractProfile(text:string):Partial<Record<ProfileField,string>> {
 const fields:Partial<Record<ProfileField,string>>={};let customerBlock=false;
 for(const raw of text.slice(0,150000).split(/\r?\n/).slice(0,5000)){
  let line=raw.trim();if(!line){customerBlock=false;continue;}
  if(/^(?:supplier|provider|service provider|contractor|پیمانکار|مجری|szolgáltató)(?:\s|[:：]|$)/i.test(line)){customerBlock=false;continue;}
  const prefixed=prefix.test(line);
  if(prefixed){line=line.replace(prefix,"");if(!line){customerBlock=true;continue;}}
  if(!prefixed&&!customerBlock)continue;
  const pair=line.match(/^([^:：]{1,80})\s*[:：]\s*(.{1,1000})$/);if(!pair)continue;
  const key=Object.entries(aliases).find(([,names])=>names.some(n=>n.toLocaleLowerCase()===pair[1].trim().toLocaleLowerCase()))?.[0] as ProfileField|undefined;
  if(!key||fields[key])continue;
  let value=pair[2].trim();if(!value||/[<>\u0000-\u0008]/.test(value))continue;
  if(key==="email"){value=value.toLowerCase();if(value.length>320||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))continue;}
  if(key==="country_code"){value=value.toUpperCase();if(!/^[A-Z]{2}$/.test(value))continue;}
  if(key==="website_url"&&!/^https?:\/\//i.test(value))continue;
  if(["name","legal_name"].includes(key)&&value.length>240||["registration_number","vat_number","phone"].includes(key)&&value.length>100)continue;
  fields[key]=value;
 }
 return fields;
}
