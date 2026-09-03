"use server";

import { redirect } from "next/navigation";
import { readServerPublicAttribution, recordConfirmedPublicConversion } from "@/lib/analytics/server-conversions";
import { createAnalyticsAdminClient } from "@/lib/supabase/analytics-admin";

const COMPANY_SIZES = new Set(["1_49", "50_199", "200_999", "1000_plus"]);
const TIMELINES = new Set(["0_3m", "3_6m", "6_12m", "12m_plus", "exploring"]);
const DECISION_ROLES = new Set(["decision_maker", "executive_sponsor", "evaluator", "researcher"]);
const USE_CASES = new Set(["operations", "customer_support", "sales_marketing", "research_analysis", "software_delivery", "other"]);
const CONSUMER_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

function cleanText(value: FormDataEntryValue | null, maxLength: number) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text.slice(0, maxLength);
}

function safeChoice(value: FormDataEntryValue | null, allowed: Set<string>) {
  const candidate = String(value ?? "").trim();
  return allowed.has(candidate) ? candidate : "";
}

function isWorkEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return Boolean(domain) && !CONSUMER_EMAIL_DOMAINS.has(domain);
}

function isMarketingQualified(input: {
  workEmail: string;
  companySize: string;
  timeline: string;
  decisionRole: string;
}) {
  const enterpriseScale = input.companySize === "50_199" || input.companySize === "200_999" || input.companySize === "1000_plus";
  const activeHorizon = input.timeline === "0_3m" || input.timeline === "3_6m";
  const accountableRole = input.decisionRole === "decision_maker" || input.decisionRole === "executive_sponsor";
  return isWorkEmail(input.workEmail) && enterpriseScale && activeHorizon && accountableRole;
}

export async function submitEnterpriseIntake(formData: FormData) {
  // Honeypot: silently reject automated submissions without creating lead records.
  if (cleanText(formData.get("website"), 200)) {
    redirect("/enterprise?submitted=1");
  }

  const fullName = cleanText(formData.get("fullName"), 120);
  const workEmail = cleanText(formData.get("workEmail"), 200).toLowerCase();
  const companyName = cleanText(formData.get("companyName"), 160);
  const jobTitle = cleanText(formData.get("jobTitle"), 120);
  const companySize = safeChoice(formData.get("companySize"), COMPANY_SIZES);
  const timeline = safeChoice(formData.get("timeline"), TIMELINES);
  const decisionRole = safeChoice(formData.get("decisionRole"), DECISION_ROLES);
  const useCase = safeChoice(formData.get("useCase"), USE_CASES);
  const consent = formData.get("consent") === "yes";

  if (
    fullName.length < 2 ||
    companyName.length < 2 ||
    jobTitle.length < 2 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail) ||
    !companySize ||
    !timeline ||
    !decisionRole ||
    !useCase ||
    !consent
  ) {
    redirect("/enterprise?intake_error=1");
  }

  const qualificationStatus = isMarketingQualified({
    workEmail,
    companySize,
    timeline,
    decisionRole,
  }) ? "marketing_qualified" : "not_yet_qualified";

  const supabase = createAnalyticsAdminClient();
  if (!supabase) {
    redirect("/enterprise?intake_error=1");
  }

  const attribution = await readServerPublicAttribution();
  const { error } = await supabase.from("enterprise_lead_intake").insert({
    full_name: fullName,
    work_email: workEmail,
    company_name: companyName,
    job_title: jobTitle,
    company_size_bucket: companySize,
    deployment_timeline: timeline,
    decision_role: decisionRole,
    use_case: useCase,
    qualification_status: qualificationStatus,
    attribution_kind: attribution?.kind ?? null,
    attribution_source: attribution?.source ?? null,
    landing_path: attribution?.landing_path ?? null,
    referrer_host: attribution?.referrer_host ?? null,
  });

  if (error) {
    console.error("enterprise_intake_insert_failed", { code: error.code ?? null });
    redirect("/enterprise?intake_error=1");
  }

  if (qualificationStatus === "marketing_qualified") {
    await recordConfirmedPublicConversion("qualified_enterprise_lead_conversion", "/enterprise", {
      company_size: companySize,
      timeline,
      decision_role: decisionRole,
      use_case: useCase,
    });
  }

  redirect(`/enterprise?submitted=1&qualification=${qualificationStatus}`);
}
