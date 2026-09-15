"use client";

import { useEffect } from "react";

const DEFAULT_NAMES: Record<string,string> = {
  github: "GitHub",
  vercel: "Vercel",
  supabase: "Supabase",
  cloudflare: "Cloudflare",
  google_workspace: "Google Workspace",
  google_search_console: "Google Search Console",
  google_analytics: "Google Analytics 4",
  google_drive: "Google Drive",
  google_business_profile: "Google Business Profile",
  google_ads: "Google Ads",
  microsoft_365: "Microsoft 365",
  microsoft_teams: "Microsoft Teams",
  slack: "Slack",
  figma: "Figma",
  ahrefs: "Ahrefs",
  semrush: "Semrush",
  website_cms: "Website / CMS",
  meta_marketing: "Meta Marketing",
  linkedin_marketing: "LinkedIn Marketing",
  tiktok_business: "TikTok for Business",
  youtube: "YouTube",
};

export function IntegrationFormEnhancer(){
  useEffect(()=>{
    const select=document.querySelector<HTMLSelectElement>('form select[name="providerKey"]');
    const input=document.querySelector<HTMLInputElement>('form input[name="displayName"]');
    if(!select||!input)return;

    let userEdited=false;
    let lastGenerated="";
    const generatedName=()=>DEFAULT_NAMES[select.value]||select.selectedOptions[0]?.textContent?.trim()||"Company connection";
    const applyDefault=()=>{
      const next=generatedName();
      if(!userEdited||!input.value.trim()||input.value===lastGenerated){
        input.value=next;
        lastGenerated=next;
        userEdited=false;
        input.dispatchEvent(new Event("input",{bubbles:true}));
      }
    };
    const onInput=()=>{userEdited=input.value!==lastGenerated;};
    select.addEventListener("change",applyDefault);
    input.addEventListener("input",onInput);
    applyDefault();
    return()=>{select.removeEventListener("change",applyDefault);input.removeEventListener("input",onInput);};
  },[]);
  return null;
}
