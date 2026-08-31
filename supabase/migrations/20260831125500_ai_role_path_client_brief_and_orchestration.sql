-- AI Role Path advertising client brief + dependency orchestration.
-- Production-safe data migration; external actions remain Human CEO gated.

insert into public.project_resources (organization_id,project_id,resource_type,name,url,external_reference,status,metadata)
select p.organization_id,p.id,'website','AI Role Path production website','https://airolepath.com','airolepath.com','connected',jsonb_build_object('purpose','Primary customer/product website for advertising-agency discovery and QA','source_project_code','AI-PR-001','verified_via','Vercel project domains','validated_at',now())
from public.projects p
where p.project_code='AI-RP-GTM-001'
and not exists (select 1 from public.project_resources r where r.project_id=p.id and r.url='https://airolepath.com');

insert into public.project_strategy_briefs (organization_id,project_id,brief_code,title,strategic_question,internal_evidence,assumptions,analysis_priorities,required_outputs,web_research_status,status)
select p.organization_id,p.id,'AI-RP-GTM-CLIENT-001','AI Role Path — Client & GTM Brief','How should RYTHM Advertising Agency position, launch and grow AI Role Path using verified product evidence, disciplined claims and governed experimentation?',
jsonb_build_array(
  jsonb_build_object('type','source_project','reference','AI-PR-001','fact','AI Role Path is the source product project connected to this campaign'),
  jsonb_build_object('type','website','url','https://airolepath.com','fact','Primary public product website; agency must review the live experience before finalizing positioning or creative'),
  jsonb_build_object('type','repository','reference','rythm2237/AI-positions-roadmap','fact','Source repository is connected through the AI-PR-001 project'),
  jsonb_build_object('type','deployment','reference','ai-positions-roadmap','fact','Current production application is deployed on Vercel and custom domains include airolepath.com and www.airolepath.com'),
  jsonb_build_object('type','product_scope','fact','The product provides AI-career profiles, roadmaps, learning paths, CV analysis/career matching and governed AI assistance; campaign claims must be verified against current product behavior before publication')
),
jsonb_build_array(
  'Target ICP priorities are hypotheses until validated by evidence and CEO direction',
  'Pricing, paid acquisition budget and geographic launch scope are not yet authorized facts unless explicitly supplied',
  'Any feature not verified in the website, project knowledge or source product evidence must be treated as an assumption, not a customer-facing claim'
),
jsonb_build_array(
  'Review https://airolepath.com end-to-end from a prospective customer perspective',
  'Build a verified product-fact and claim register before creating ads',
  'Segment and prioritize ICPs and jobs-to-be-done',
  'Define positioning and message hierarchy',
  'Design channel portfolio and experiments with measurable stop/scale rules',
  'Prepare creative, copy, content, measurement, finance and compliance deliverables',
  'Escalate only consequential external actions to Human CEO approval'
),
jsonb_build_array(
  'Client fact register and evidence/assumption ledger',
  'ICP and positioning decision memo',
  'Campaign creative brief and copy system',
  'Paid and organic channel plan',
  'Measurement and attribution specification',
  'Budget scenarios and finance review',
  'Legal/compliance review',
  'CEO launch-gate package'
),
'allowed_read_only','ready'
from public.projects p where p.project_code='AI-RP-GTM-001'
on conflict (project_id,brief_code) do update set
  title=excluded.title,
  strategic_question=excluded.strategic_question,
  internal_evidence=excluded.internal_evidence,
  assumptions=excluded.assumptions,
  analysis_priorities=excluded.analysis_priorities,
  required_outputs=excluded.required_outputs,
  web_research_status=excluded.web_research_status,
  status=excluded.status;

create or replace function public.refresh_project_action_dependencies(p_project_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.action_items a set status='blocked'
  where a.project_id=p_project_id and a.status='open'
    and jsonb_array_length(coalesce(a.dependencies,'[]'::jsonb))>0
    and exists (
      select 1 from jsonb_array_elements_text(a.dependencies) dep(code)
      left join public.action_items d on d.project_id=a.project_id and d.action_code=dep.code
      where d.id is null or d.status<>'completed'
    );

  update public.action_items a set status='open'
  where a.project_id=p_project_id and a.status='blocked'
    and jsonb_array_length(coalesce(a.dependencies,'[]'::jsonb))>0
    and not exists (
      select 1 from jsonb_array_elements_text(a.dependencies) dep(code)
      left join public.action_items d on d.project_id=a.project_id and d.action_code=dep.code
      where d.id is null or d.status<>'completed'
    );
end;
$$;

create or replace function public.trg_refresh_project_action_dependencies()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.project_id is not null and new.status is distinct from old.status then
    perform public.refresh_project_action_dependencies(new.project_id);
  end if;
  return new;
end;
$$;

drop trigger if exists action_items_refresh_dependencies on public.action_items;
create trigger action_items_refresh_dependencies after update of status on public.action_items for each row execute function public.trg_refresh_project_action_dependencies();

update public.action_items
set authorization_snapshot = coalesce(authorization_snapshot,'{}'::jsonb) || jsonb_build_object('orchestration_mode','auto_internal','human_approval_required',false,'external_side_effect',false,'auto_start_when_dependencies_complete',true)
where project_id=(select id from public.projects where project_code='AI-RP-GTM-001') and action_code<>'AI-RP-GTM-001-A11';

update public.action_items
set authorization_snapshot = coalesce(authorization_snapshot,'{}'::jsonb) || jsonb_build_object('orchestration_mode','human_gate','human_approval_required',true,'external_side_effect',true,'approval_reason','Final campaign launch may cause publishing, spend or external commitments')
where project_id=(select id from public.projects where project_code='AI-RP-GTM-001') and action_code='AI-RP-GTM-001-A11';

select public.refresh_project_action_dependencies((select id from public.projects where project_code='AI-RP-GTM-001'));

update public.action_items
set status='in_progress'
where project_id=(select id from public.projects where project_code='AI-RP-GTM-001') and action_code='AI-RP-GTM-001-A01' and status='open';
