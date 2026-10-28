create table if not exists public.nail_2nya_public_media_chunks_v4 (
  asset_key text not null,
  chunk_index integer not null check (chunk_index >= 0),
  base64_data text not null,
  created_at timestamptz not null default now(),
  primary key (asset_key, chunk_index)
);
alter table public.nail_2nya_public_media_chunks_v4 enable row level security;
drop policy if exists nail_2nya_public_media_chunks_v4_read on public.nail_2nya_public_media_chunks_v4;
create policy nail_2nya_public_media_chunks_v4_read on public.nail_2nya_public_media_chunks_v4 for select to anon, authenticated using (asset_key = 'hero-v4');
grant select on public.nail_2nya_public_media_chunks_v4 to anon, authenticated;
revoke insert, update, delete on public.nail_2nya_public_media_chunks_v4 from anon, authenticated;