insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('nail-2nya-media','nail-2nya-media',true,10485760,array['video/mp4','image/webp','image/jpeg','image/png'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "nail_2nya_temp_hero_upload"
on storage.objects for insert
to anon
with check (bucket_id='nail-2nya-media' and name='hero/hero-v1.mp4');