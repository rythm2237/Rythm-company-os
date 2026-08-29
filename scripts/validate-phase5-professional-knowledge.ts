import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(file:string)=>fs.readFileSync(path.join(root,file),"utf8");
const migration=read("supabase/migrations/20260829190000_trusted_professional_knowledge_packs.sql");
const resolver=read("lib/trusted-agent-knowledge.ts");
const profile=read("app/(app)/agents/[code]/page.tsx");

const requiredSources=[
  "LinkedIn Marketing Solutions","FTC Advertising & Marketing","ICO Direct Marketing Guidance","IFRS Foundation",
  "ACCA Performance Management","Nielsen Norman Group Content Strategy","PMI Standards","Bain Go-to-Market Strategy",
  "SHRM Workforce Management","ILO Human Resources Management Systems","OECD Data","Eurostat Data",
];
const requiredRoles=[
  "Advertising Account Manager","Finance Operations Manager","Legal & Compliance Advisor","People & AI Workforce Operations Manager",
  "Advertising Analytics Specialist","Advertising Content Specialist","Advertising Copywriter","Advertising Creative Director",
  "Senior GTM Strategist","Performance Marketing Specialist","Advertising Strategy Director","Customer Support & Communications Manager",
  "Strategy & Corporate Development Advisor","Operations Analyst","Finance Analyst","Compliance Specialist","Research & Intelligence Analyst",
  "Legal, Privacy & Regulatory Advisor","Graphic Designer","Full-Stack Web Developer","Executive Orchestrator & AI Chief of Staff","AI Systems Validation Specialist",
];

function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}
for(const source of requiredSources)assert(migration.includes(source),`Missing trusted source seed: ${source}`);
for(const role of requiredRoles)assert(migration.includes(`'${role}'`)||migration.includes(`\"${role}\"`),`Missing source-backed role foundation: ${role}`);
assert(migration.includes("source_backed_foundation_bound"),"Professional knowledge rebinding audit event is missing.");
assert(migration.includes("cardinality(source_ids)=0"),"Migration must fail closed when provenance is empty.");
assert(!/agent_asset_profiles[\s\S]{0,300}(current_level|level_display_name)\s*=/.test(migration),"Knowledge migration must not self-promote professional level.");

assert(resolver.includes('.eq("canonical_role", normalized.canonicalRole)'),"Resolver must prefer exact canonical-role foundations.");
assert(resolver.includes('.is("canonical_role", null)'),"Resolver must use generic family foundations only as fallback.");
assert(resolver.includes("VERIFIED PROFESSIONAL SOURCE PROVENANCE"),"Runtime context must expose verified source provenance.");
assert(resolver.includes("Customer Support & Communications Manager"),"Ready Company communication role normalization is missing.");
assert(resolver.includes("Senior GTM Strategist"),"Senior GTM normalization is missing.");

assert(profile.includes("Professional knowledge provenance"),"Agent profile must show professional knowledge provenance.");
assert(profile.includes("knowledge_source_registry"),"Agent profile must resolve registered source metadata.");
assert(profile.includes("View source"),"Agent profile must expose the canonical source link.");
assert(profile.includes("Source-backed professional knowledge is platform-managed"),"Profile must distinguish professional knowledge from tenant knowledge.");

console.log(`Phase 5 professional knowledge validation passed: ${requiredRoles.length} canonical role packs, ${requiredSources.length} new trusted sources.`);
