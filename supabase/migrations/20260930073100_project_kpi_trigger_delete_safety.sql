begin;
create or replace function public.sync_project_kpi_completion_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_project_id uuid;
  v_org uuid;
  v_count integer;
  v_achieved integer;
  v_kpi_id uuid;
begin
  if tg_op='DELETE' then
    v_project_id:=old.project_id;v_org:=old.organization_id;v_kpi_id:=old.id;
  else
    v_project_id:=new.project_id;v_org:=new.organization_id;v_kpi_id:=new.id;
  end if;

  if tg_op<>'DELETE' and new.status='achieved' then
    if not exists(select 1 from public.project_completion_evidence where project_id=v_project_id and external_system_reference='project_kpi:'||new.id::text) then
      insert into public.project_completion_evidence(
        organization_id,project_id,lifecycle_dimension,evidence_type,source,authoritative_source,collected_at,validator,verification_result,
        external_system_reference,after_value,unit,structured_data
      ) values(
        v_org,v_project_id,'outcome','project_kpi_achieved','project_kpis',true,now(),'structured_kpi_status','achieved',
        'project_kpi:'||new.id::text,new.current_value,new.unit,jsonb_build_object('kpi_id',new.id,'name',new.name,'target_value',new.target_value,'current_value',new.current_value,'status',new.status)
      );
    end if;
  end if;

  select count(*),count(*) filter(where status='achieved') into v_count,v_achieved from public.project_kpis where project_id=v_project_id;
  if v_count>0 and v_count=v_achieved then
    update public.project_completion_criteria
    set state='passed',failure_reason=null,metadata=metadata||jsonb_build_object('validated_by','project_kpis','validated_at',now()),updated_at=now()
    where project_id=v_project_id and dimension='outcome' and criterion_key='policy-default-outcome' and state not in('waived','not_applicable');
  else
    update public.project_completion_criteria
    set state='pending',failure_reason=case when v_count=0 then 'No achieved project KPI evidence is currently recorded.' else 'One or more required project KPIs are not achieved.' end,
        metadata=metadata||jsonb_build_object('validated_by','project_kpis','rechecked_at',now()),updated_at=now()
    where project_id=v_project_id and dimension='outcome' and criterion_key='policy-default-outcome' and metadata->>'validated_by'='project_kpis' and state='passed';
  end if;
  perform public.evaluate_project_completion_v1(v_project_id,'project_kpi_changed','project_kpi',v_kpi_id);
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.sync_project_kpi_completion_v1() from public,anon,authenticated;
commit;
