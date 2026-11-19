CREATE OR REPLACE FUNCTION public.generate_communication_daily_digest()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
begin
  for r in
    select o.id organization_id, om.user_id,
      count(*) filter (where ct.last_message_at >= now()-interval '24 hours') as inbound_threads,
      count(*) filter (where ct.last_message_at >= now()-interval '24 hours' and ct.priority='high') as high_priority,
      count(*) filter (where ct.last_message_at >= now()-interval '24 hours' and ct.requires_manager_attention) as attention_count
    from public.organizations o
    join public.organization_members om on om.organization_id=o.id and om.role='owner'
    left join public.communication_threads ct on ct.organization_id=o.id
    group by o.id,om.user_id
  loop
    if r.inbound_threads > 0 then
      insert into public.notifications(organization_id,user_id,category,severity,title,body,action_url,source_type,dedupe_key,delivery_status)
      values(r.organization_id,r.user_id,'communication_digest',case when r.attention_count>0 then 'critical' else 'info' end,'Daily Communication Report',r.inbound_threads||' conversations in the last 24h; '||r.high_priority||' high priority; '||r.attention_count||' need manager attention.','/communication','communication_digest','communication-digest-'||current_date::text,'pending')
      on conflict (organization_id,user_id,dedupe_key) where dedupe_key is not null do update set body=excluded.body,severity=excluded.severity,created_at=now(),read_at=null,archived_at=null;
    end if;
  end loop;
end;
$function$
