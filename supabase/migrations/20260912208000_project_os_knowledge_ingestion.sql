-- RYTHM Project OS durable document knowledge ingestion.
-- Uploaded project files remain private and are converted into tenant-scoped Project Knowledge
-- by a lease-based service worker. This reuses the existing document extraction pipeline.

alter table public.project_documents add column if not exists context_document_id uuid references public.project_context_documents(id) on delete set null;
alter table public.project_documents add column if not exists ingestion_attempt_count integer not null default 0;
alter table public.project_documents add column if not exists max_ingestion_attempts integer not null default 3;
alter table public.project_documents add column if not exists next_ingestion_at timestamptz;
alter table public.project_documents add column if not exists ingestion_lease_owner text;
alter table public.project_documents add column if not exists ingestion_lease_expires_at timestamptz;
alter table public.project_documents add column if not exists last_ingestion_error text;
alter table public.project_documents add column if not exists updated_at timestamptz not null default now();

alter table public.project_documents drop constraint if exists project_documents_extraction_status_check;
alter table public.project_documents add constraint project_documents_extraction_status_check
  check(extraction_status in('pending','processing','retrying','completed','failed')) not valid;
alter table public.project_documents validate constraint project_documents_extraction_status_check;

create table if not exists public.project_document_chunks(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  document_id uuid not null references public.project_documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (to_tsvector('simple',coalesce(content,''))) stored,
  created_at timestamptz not null default now(),
  unique(document_id,chunk_index)
);

alter table public.project_document_chunks enable row level security;
drop policy if exists project_document_chunks_member_read on public.project_document_chunks;
create policy project_document_chunks_member_read on public.project_document_chunks for select to authenticated using(public.is_org_member(organization_id));
drop policy if exists project_document_chunks_owner_write on public.project_document_chunks;
create policy project_document_chunks_owner_write on public.project_document_chunks for all to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));

create index if not exists project_documents_ingestion_queue_idx
  on public.project_documents(extraction_status,next_ingestion_at,created_at)
  where extraction_status in('pending','processing','retrying');
create index if not exists project_document_chunks_project_idx on public.project_document_chunks(project_id,document_id,chunk_index);
create index if not exists project_document_chunks_search_idx on public.project_document_chunks using gin(search_vector);

create or replace function public.recover_stale_project_document_ingestions_v1()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare recovered integer;
begin
  update public.project_documents
  set extraction_status=case when ingestion_attempt_count>=max_ingestion_attempts then 'failed' else 'retrying' end,
      last_ingestion_error=case when ingestion_attempt_count>=max_ingestion_attempts then 'Document ingestion retry limit reached.' else 'Document ingestion worker lease expired.' end,
      ingestion_lease_owner=null,
      ingestion_lease_expires_at=null,
      next_ingestion_at=case when ingestion_attempt_count>=max_ingestion_attempts then null else now()+make_interval(secs=>least(1800,30*(2^least(ingestion_attempt_count,6)))) end,
      updated_at=now()
  where extraction_status='processing' and ingestion_lease_expires_at<now();
  get diagnostics recovered=row_count;
  return recovered;
end $$;
revoke all on function public.recover_stale_project_document_ingestions_v1() from public,anon,authenticated;
grant execute on function public.recover_stale_project_document_ingestions_v1() to service_role;

create or replace function public.claim_project_document_ingestions_v1(
  worker_id text,
  claim_limit integer default 4,
  lease_seconds integer default 300,
  project_id_filter uuid default null
)
returns setof public.project_documents
language plpgsql
security definer
set search_path=public
as $$
begin
  if coalesce(worker_id,'')='' then raise exception 'worker_id required'; end if;
  return query
  with candidates as(
    select d.id
    from public.project_documents d
    join public.projects p on p.id=d.project_id and p.status<>'cancelled'
    where d.extraction_status in('pending','retrying')
      and (project_id_filter is null or d.project_id=project_id_filter)
      and (d.next_ingestion_at is null or d.next_ingestion_at<=now())
      and (d.ingestion_lease_expires_at is null or d.ingestion_lease_expires_at<now())
      and d.ingestion_attempt_count<d.max_ingestion_attempts
    order by d.created_at asc
    for update of d skip locked
    limit greatest(1,least(claim_limit,12))
  )
  update public.project_documents d
  set extraction_status='processing',
      ingestion_attempt_count=ingestion_attempt_count+1,
      ingestion_lease_owner=worker_id,
      ingestion_lease_expires_at=now()+make_interval(secs=>greatest(60,lease_seconds)),
      last_ingestion_error=null,
      updated_at=now()
  from candidates c where d.id=c.id
  returning d.*;
end $$;
revoke all on function public.claim_project_document_ingestions_v1(text,integer,integer,uuid) from public,anon,authenticated;
grant execute on function public.claim_project_document_ingestions_v1(text,integer,integer,uuid) to service_role;

comment on table public.project_document_chunks is 'Private tenant-scoped chunks extracted from project files for Project Knowledge retrieval.';
comment on function public.claim_project_document_ingestions_v1(text,integer,integer,uuid) is 'Service-only durable lease primitive for Project Knowledge document extraction.';