-- RYTHM Project OS proposal governance convergence.
-- A proposal routed to Human CEO authority creates a durable continuation task.
-- Canonical approval resolution updates Proposal + Decision Memory and unblocks only that continuation.

alter table public.project_proposals add column if not exists source_execution_id uuid references public.project_executions(id) on delete set null;
alter table public.project_proposals add column if not exists source_task_run_id uuid references public.project_task_runs(id) on delete set null;
alter table public.project_proposals add column if not exists decided_by_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists project_decision_memory_proposal_once_idx
  on public.project_decision_memory(proposal_id)
  where proposal_id is not null;

-- Once the canonical approval request is attached, reserve a continuation in the active execution.
-- This prevents a project execution from being marked complete while an executive proposal is unresolved.
create or replace function public.ensure_project_proposal_continuation_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  execution_row public.project_executions%rowtype;
  task_key_value text;
  idempotency_value text;
begin
  if new.approval_request_id is null then return new; end if;
  if old.approval_request_id is not distinct from new.approval_request_id then return new; end if;

  select * into execution_row
  from public.project_executions
  where project_id=new.project_id
    and organization_id=new.organization_id
    and status in('queued','running','paused')
  order by execution_no desc
  limit 1;

  if execution_row.id is null then
    -- Proposal may originate outside an active project execution. It still remains governed,
    -- but there is no execution instance to keep alive.
    return new;
  end if;

  task_key_value := 'proposal-' || replace(new.id::text,'-','');
  idempotency_value := 'project:' || new.project_id::text || ':execution:' || execution_row.execution_no::text || ':proposal:' || new.id::text;

  insert into public.project_task_runs(
    organization_id,project_id,execution_id,action_item_id,task_key,title,assigned_agent_id,
    status,priority,dependencies,waiting_on_approval_id,idempotency_key,input
  ) values (
    new.organization_id,new.project_id,execution_row.id,null,task_key_value,
    left('Execute approved proposal: ' || new.title,240),new.created_by_agent_id,
    'waiting_for_approval',2,'[]'::jsonb,new.approval_request_id,idempotency_value,
    jsonb_build_object(
      'approved_proposal_id',new.id,
      'proposal_type',new.proposal_type,
      'executive_summary',new.executive_summary,
      'rationale',new.rationale,
      'expected_impact',new.expected_impact,
      'estimated_cost',new.estimated_cost,
      'cost_currency',new.cost_currency,
      'required_permissions',new.required_permissions,
      'authorization_state','pending_human_ceo',
      'instruction','After approval, continue implementation within the approved proposal scope. Do not ask for the same approval again. Any downstream external side effect remains subject to the Integration & Execution Gateway and applicable risk policy.'
    )
  ) on conflict(organization_id,idempotency_key) do nothing;

  update public.project_proposals
    set source_execution_id=coalesce(source_execution_id,execution_row.id), updated_at=now()
  where id=new.id;

  insert into public.project_activity_events(
    organization_id,project_id,execution_id,agent_id,event_type,headline,detail,importance,metadata
  ) values (
    new.organization_id,new.project_id,execution_row.id,new.created_by_agent_id,
    'proposal.awaiting_decision','Executive decision required: ' || new.title,
    new.executive_summary,'attention',jsonb_build_object('proposal_id',new.id,'approval_request_id',new.approval_request_id)
  );
  return new;
end $$;

revoke all on function public.ensure_project_proposal_continuation_v1() from public,anon,authenticated;

drop trigger if exists trg_project_proposal_continuation on public.project_proposals;
create trigger trg_project_proposal_continuation
  after update of approval_request_id on public.project_proposals
  for each row execute function public.ensure_project_proposal_continuation_v1();

-- Converge canonical Approval Engine decisions back into project proposal state and decision memory.
create or replace function public.sync_project_proposal_approval_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  proposal_row public.project_proposals%rowtype;
  decision_text text;
begin
  if new.subject_type <> 'project_proposal' then return new; end if;
  if old.status is not distinct from new.status then return new; end if;
  if new.status not in('approved','rejected','expired','cancelled') then return new; end if;

  select * into proposal_row
  from public.project_proposals
  where id=new.subject_id and organization_id=new.organization_id
  for update;
  if proposal_row.id is null then return new; end if;

  if new.status='approved' then
    update public.project_proposals
      set status='approved', decided_at=coalesce(new.resolved_at,now()), decided_by_user_id=new.approver_user_id, updated_at=now()
    where id=proposal_row.id;
    decision_text := 'APPROVED: ' || proposal_row.title;

    -- The generic approval trigger queues the waiting task. Add explicit authorization context
    -- so the agent continues the approved proposal rather than requesting the same decision again.
    update public.project_task_runs
      set input=coalesce(input,'{}'::jsonb) || jsonb_build_object(
            'authorization_state','approved_by_human_ceo',
            'approval_request_id',new.id,
            'approved_at',coalesce(new.resolved_at,now()),
            'approval_note',coalesce(new.response_note,'')
          ),
          updated_at=now()
    where waiting_on_approval_id is null
      and organization_id=new.organization_id
      and project_id=proposal_row.project_id
      and input->>'approved_proposal_id'=proposal_row.id::text
      and status='queued';
  elsif new.status='rejected' then
    update public.project_proposals
      set status='rejected', decided_at=coalesce(new.resolved_at,now()), decided_by_user_id=new.approver_user_id, updated_at=now()
    where id=proposal_row.id;
    decision_text := 'REJECTED: ' || proposal_row.title;

    -- Rejected optional initiatives must not deadlock the whole project. The generic trigger marks
    -- approval-dependent work blocked; this proposal-specific convergence cancels only its continuation.
    update public.project_task_runs
      set status='cancelled', waiting_on_approval_id=null, error_class='proposal_rejected',
          error_message='Executive proposal rejected.', lease_owner=null, lease_expires_at=null, updated_at=now()
    where organization_id=new.organization_id
      and project_id=proposal_row.project_id
      and input->>'approved_proposal_id'=proposal_row.id::text
      and status in('waiting_for_approval','blocked');
  else
    update public.project_proposals
      set status=case when new.status='expired' then 'needs_revision' else 'rejected' end,
          decided_at=coalesce(new.resolved_at,now()), decided_by_user_id=new.approver_user_id, updated_at=now()
    where id=proposal_row.id;
    decision_text := upper(new.status) || ': ' || proposal_row.title;

    update public.project_task_runs
      set status='cancelled', waiting_on_approval_id=null, error_class='proposal_'||new.status,
          error_message='Executive proposal approval '||new.status||'.', lease_owner=null, lease_expires_at=null, updated_at=now()
    where organization_id=new.organization_id
      and project_id=proposal_row.project_id
      and input->>'approved_proposal_id'=proposal_row.id::text
      and status in('waiting_for_approval','blocked');
  end if;

  insert into public.project_decision_memory(
    organization_id,project_id,decision,rationale,decision_maker_type,decision_maker_id,proposal_id,constraints,outcome
  ) values (
    new.organization_id,proposal_row.project_id,decision_text,
    coalesce(new.response_note,proposal_row.rationale,''),'human_ceo',new.approver_user_id,proposal_row.id,
    coalesce(new.conditions,'[]'::jsonb),
    jsonb_build_object('approval_request_id',new.id,'approval_status',new.status,'proposal_type',proposal_row.proposal_type)
  ) on conflict(proposal_id) where proposal_id is not null do update
    set decision=excluded.decision,
        rationale=excluded.rationale,
        decision_maker_type=excluded.decision_maker_type,
        decision_maker_id=excluded.decision_maker_id,
        constraints=excluded.constraints,
        outcome=excluded.outcome;

  insert into public.project_activity_events(
    organization_id,project_id,execution_id,agent_id,event_type,headline,detail,importance,metadata
  ) values (
    new.organization_id,proposal_row.project_id,proposal_row.source_execution_id,proposal_row.created_by_agent_id,
    'proposal.'||new.status,
    case when new.status='approved' then 'Proposal approved: ' else 'Proposal '||new.status||': ' end || proposal_row.title,
    coalesce(new.response_note,proposal_row.executive_summary),
    case when new.status='approved' then 'major' else 'attention' end,
    jsonb_build_object('proposal_id',proposal_row.id,'approval_request_id',new.id,'human_ceo',new.approver_user_id)
  );

  return new;
end $$;

revoke all on function public.sync_project_proposal_approval_v1() from public,anon,authenticated;

drop trigger if exists trg_z_project_proposal_approval_sync on public.approval_requests;
create trigger trg_z_project_proposal_approval_sync
  after update of status on public.approval_requests
  for each row execute function public.sync_project_proposal_approval_v1();

comment on function public.sync_project_proposal_approval_v1() is 'Converges Human CEO approval decisions into proposal status, durable decision memory, activity, and project continuation.';