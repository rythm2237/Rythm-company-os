-- W03 (safe reapplication on Production/staging with differing migration ledgers): independently reproduced authenticated cross-company agent references.
-- The parent composite key is provided by w03_project_tenant_relationships.
-- Validate historical rows only after the owner-reviewed tenant audit.
do $w03_guard$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.agent_memories'::regclass and conname='agent_memories_agent_tenant_w03_fk') then
    alter table public.agent_memories add constraint agent_memories_agent_tenant_w03_fk
 foreign key(agent_id,organization_id) references public.agents(id,organization_id) on delete cascade not valid;
  end if;
end $w03_guard$;
do $w03_guard$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.agent_attachments'::regclass and conname='agent_attachments_agent_tenant_w03_fk') then
    alter table public.agent_attachments add constraint agent_attachments_agent_tenant_w03_fk
 foreign key(agent_id,organization_id) references public.agents(id,organization_id) on delete cascade not valid;
  end if;
end $w03_guard$;
do $w03_guard$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.agent_attachments'::regclass and conname='agent_attachments_id_organization_w03_key') then
    alter table public.agent_attachments add constraint agent_attachments_id_organization_w03_key unique(id,organization_id);
  end if;
end $w03_guard$;
do $w03_guard$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.agent_memories'::regclass and conname='agent_memories_source_tenant_w03_fk') then
    alter table public.agent_memories add constraint agent_memories_source_tenant_w03_fk
 foreign key(source_attachment_id,organization_id) references public.agent_attachments(id,organization_id) on delete set null (source_attachment_id) not valid;
  end if;
end $w03_guard$;
