-- Private Personal AI files and metered document-ingestion request type.
-- The bucket is private and intentionally receives no anon/authenticated storage policy.
-- Existing storage policies for other RYTHM buckets are left untouched.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ai-workspace-private','ai-workspace-private',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown','text/csv'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.ai_usage_requests drop constraint if exists ai_usage_requests_request_kind_check;
alter table public.ai_usage_requests add constraint ai_usage_requests_request_kind_check check(request_kind in ('answer','prompt_enhancement','agent_execution','file_ingestion'));
alter table public.aiw_files add column if not exists usage_request_id uuid references public.ai_usage_requests(id);
alter table public.aiw_files add column if not exists content_hash text;
alter table public.aiw_files add column if not exists chunk_count integer not null default 0 check(chunk_count>=0);
alter table public.aiw_files add column if not exists last_ingestion_error text;
