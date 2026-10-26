export function inspectW01Boundary(env: Record<string,string|undefined>) {
 if(env.VERCEL_ENV!=="preview"||env.RYTHM_ENV!=="staging"||env.VERCEL_GIT_COMMIT_REF!=="foundation/w01-baseline-staging-safety") return null;
 const ref="viqjdgohtxqkrdgwtull";
 const controls={
  staging_backend:env.NEXT_PUBLIC_SUPABASE_URL==="https://"+ref+".supabase.co",
  publishable_key:/^sb_publishable_/.test(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??""),
  agent_execution_disabled:env.RYTHM_AGENT_EXECUTION_ENABLED==="false",
  external_actions_disabled:env.RYTHM_EXTERNAL_ACTIONS_ENABLED==="false",
  ai_budget_zero:env.RYTHM_MONTHLY_AI_BUDGET_USD==="0",
  continuous_program_disabled:env.CONTINUOUS_PROGRAM_ENGINE_ENABLED==="false",
  connection_repair_disabled:env.GOOGLE_CONNECTION_REPAIR_ENABLED==="false",
  provider_credentials_absent:["OPENAI_API_KEY","RESEND_API_KEY","STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET","GITHUB_APP_PRIVATE_KEY","GITHUB_APP_CLIENT_SECRET","BROWSERBASE_API_KEY","CRAWLY_API_KEY","CLOUDFLARE_EMAIL_WORKER_SECRET","CRON_SECRET","GOOGLE_WORKSPACE_CLIENT_SECRET","MICROSOFT_365_CLIENT_SECRET"].every(k=>!env[k]),
  privileged_backend_disabled:!env.SUPABASE_SERVICE_ROLE_KEY,
 };
 return {scope:"W01_PREVIEW_BOUNDARY",project_ref:ref,controls,safe:Object.values(controls).every(Boolean),backend_mode:"normal-user-auth-only",business_workflows_verified:false};
}
