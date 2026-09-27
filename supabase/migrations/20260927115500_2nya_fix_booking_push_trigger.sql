-- Keep the database push fallback aligned with the current edge-function contract.
-- The application route also dispatches this event; notification_deliveries has a
-- unique (appointment_id,event_type,target) constraint, so the two paths safely
-- deduplicate while providing a fallback if either dispatcher is temporarily down.

create or replace function public.nail_2nya_notify_new_booking()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'net'
as $function$
begin
  perform net.http_post(
    url := 'https://dezbacyuvsdrlpmmpjht.supabase.co/functions/v1/two-nya-push',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object(
      'appointment_id', new.id,
      'event_type', 'booking_requested',
      'target', 'admin'
    )
  );
  return new;
end
$function$;
