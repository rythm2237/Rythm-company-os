-- Batch 2.5.6 Production hotfix
-- Permit Human CEO contributions in the governed meeting transcript.

alter table public.meeting_agent_messages
  drop constraint if exists meeting_agent_messages_message_type_check;

alter table public.meeting_agent_messages
  add constraint meeting_agent_messages_message_type_check
  check (message_type in ('position','challenge','synthesis','ceo_contribution','ceo_decision','system'));

comment on constraint meeting_agent_messages_message_type_check on public.meeting_agent_messages is
  'Allowed governed meeting transcript message types, including Human CEO contributions.';
