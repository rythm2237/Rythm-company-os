-- Project context ingestion and first strategy preparation for AI Position Roadmap.
create table if not exists public.project_context_documents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, context_type text not null,
  title text not null, summary text not null, source_name text not null, source_url text,
  evidence jsonb not null default '{}'::jsonb, status text not null default 'validated',
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1), created_at timestamptz not null default now(),
  unique(project_id,title)
);
create table if not exists public.project_strategy_briefs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, brief_code text not null, title text not null,
  strategic_question text not null, internal_evidence jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb, analysis_priorities jsonb not null default '[]'::jsonb,
  required_outputs jsonb not null default '[]'::jsonb, web_research_status text not null default 'not_requested',
  status text not null default 'ready', created_at timestamptz not null default now(), unique(project_id,brief_code)
);
alter table public.project_context_documents enable row level security;
alter table public.project_strategy_briefs enable row level security;
drop policy if exists project_context_documents_member_read on public.project_context_documents;
create policy project_context_documents_member_read on public.project_context_documents for select using (public.is_org_member(organization_id));
drop policy if exists project_context_documents_owner_write on public.project_context_documents;
create policy project_context_documents_owner_write on public.project_context_documents for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
drop policy if exists project_strategy_briefs_member_read on public.project_strategy_briefs;
create policy project_strategy_briefs_member_read on public.project_strategy_briefs for select using (public.is_org_member(organization_id));
drop policy if exists project_strategy_briefs_owner_write on public.project_strategy_briefs;
create policy project_strategy_briefs_owner_write on public.project_strategy_briefs for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create index if not exists project_context_documents_project_idx on public.project_context_documents(project_id,context_type,status);
create index if not exists project_strategy_briefs_project_idx on public.project_strategy_briefs(project_id,status);

insert into public.project_context_documents (organization_id,project_id,context_type,title,summary,source_name,source_url,evidence,status,confidence)
select p.organization_id,p.id,v.context_type,v.title,v.summary,v.source_name,v.source_url,v.evidence,'validated',v.confidence
from public.projects p cross join (values
 ('product','Product operating model','Career intelligence platform providing structured AI career profiles, role roadmaps, learning paths, assessments, salary intelligence and governed AI assistance.','Company project charter',null,'{"core_value":"structured career decision support"}'::jsonb,0.95::numeric),
 ('technology','Application architecture','Next.js 16 and React 18 application using Supabase, TypeScript validation, intelligence refresh scripts and Vercel deployment.','AI Position Roadmap package.json','https://github.com/rythm2237/AI-positions-roadmap/blob/main/package.json','{"framework":"Next.js 16","ui":"React 18","database":"Supabase","deployment":"Vercel"}'::jsonb,1::numeric),
 ('operations','Admin and content operations','Admin Studio and validation scripts cover career aliases, assessments, learning architecture, salary data, occupation intelligence, source approvals and intelligence refresh.','Repository scripts and tests','https://github.com/rythm2237/AI-positions-roadmap','{"admin_studio":true,"content_validation":true,"salary_intelligence":true}'::jsonb,0.98::numeric),
 ('governance','Release and research controls','Deployments are batch-based. Human CEO retains consequential authority. Web research and external actions require approval.','RYTHM Company OS policy',null,'{"deployment_policy":"batch-based","human_approval":true,"external_actions":false}'::jsonb,1::numeric),
 ('release','Current operating resources','Repository, Vercel, Supabase, Admin Studio and production application are registered and validated.','Project resource registry',null,'{"repository":"rythm2237/AI-positions-roadmap"}'::jsonb,0.9::numeric)
) as v(context_type,title,summary,source_name,source_url,evidence,confidence)
where p.project_code='AI-PR-001'
on conflict(project_id,title) do update set summary=excluded.summary,source_name=excluded.source_name,source_url=excluded.source_url,evidence=excluded.evidence,status='validated',confidence=excluded.confidence;

update public.project_resources r set status='connected', url=case when r.resource_type='website' then coalesce(r.url,'https://ai-positions-roadmap-nfzlqoqaf-ytalashti-7156s-projects.vercel.app') else r.url end,
metadata=r.metadata||jsonb_build_object('validated_at',now(),'validation_source','project_context_ingestion')
from public.projects p where r.project_id=p.id and p.project_code='AI-PR-001';
update public.project_agents pa set status=case when a.agent_code='A-101' then 'active' else 'assigned' end, assigned_at=coalesce(pa.assigned_at,now())
from public.agents a,public.projects p where pa.agent_id=a.id and pa.project_id=p.id and p.project_code='AI-PR-001' and a.agent_code in('B-001','A-101','A-102','A-104','A-105');
update public.project_milestones m set status='completed',completed_at=coalesce(completed_at,now()) from public.projects p where m.project_id=p.id and p.project_code='AI-PR-001' and m.sequence_no in(2,3);
update public.project_milestones m set status='in_progress' from public.projects p where m.project_id=p.id and p.project_code='AI-PR-001' and m.sequence_no=4;
insert into public.project_strategy_briefs (organization_id,project_id,brief_code,title,strategic_question,internal_evidence,assumptions,analysis_priorities,required_outputs,status)
select p.organization_id,p.id,'SB-001','First governed strategy cycle','What is the highest-value controlled path for AI Position Roadmap from its current product state to a commercially credible public release?',
jsonb_build_array('Project charter','Repository architecture','Admin operations','Resource registry','Governance controls'),
jsonb_build_array('Internal evidence is primary','No autonomous publishing','Commercial release must preserve trust'),
jsonb_build_array('product readiness','target user','content quality','monetization','SEO and GEO','release risks'),
jsonb_build_array('current-state assessment','three options','recommended path','risk register','90-day plan','CEO decision draft'),'ready'
from public.projects p where p.project_code='AI-PR-001'
on conflict(project_id,brief_code) do update set strategic_question=excluded.strategic_question,internal_evidence=excluded.internal_evidence,assumptions=excluded.assumptions,analysis_priorities=excluded.analysis_priorities,required_outputs=excluded.required_outputs,status='ready';
update public.projects set stage='strategy_preparation',status='active',progress_percent=45,updated_at=now() where project_code='AI-PR-001';
update public.project_kpis k set current_value=45,status='on_track' from public.projects p where k.project_id=p.id and p.project_code='AI-PR-001' and k.name='Project onboarding completion';