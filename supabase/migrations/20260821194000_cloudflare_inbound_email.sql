-- RYTHM Company OS — Cloudflare Email Worker inbound transport
-- Preserve raw MIME so inbound mail can be reparsed later without data loss.

alter table public.communication_messages
  add column if not exists raw_mime text;

alter table public.communication_messages
  add column if not exists transport_source text;

create index if not exists communication_messages_transport_source_idx
  on public.communication_messages (organization_id, transport_source, created_at desc);
