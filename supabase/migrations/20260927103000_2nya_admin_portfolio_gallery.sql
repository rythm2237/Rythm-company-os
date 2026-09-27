-- 2nya Nail Art: admin-managed public portfolio gallery.
-- Existing static gallery entries are seeded into the portfolio table so the
-- new admin manager starts with the same visible content as the current site.

update public.nail_2nya_portfolio_items
set visible = false
where image_path like '/2nya-nailart/assets/images/%';

with seed(image_path,alt_text,featured,visible,sort_order) as (
  values
    ('/2nya-nailart/gallery/IMG_0761.jpeg','فرم طبیعی فرنچ سفید با بیس صورتی شفاف',true,true,10),
    ('/2nya-nailart/gallery/IMG_1679.jpeg','فرنچ قرمز مینیمال روی فرم بادامی',false,true,20),
    ('/2nya-nailart/gallery/IMG_2249.jpeg','فرنچ شیری روی فرم نرم و طبیعی',false,true,30),
    ('/2nya-nailart/gallery/IMG_2345.jpeg','فرنچ قرمز کلاسیک با جزئیات قرمز عمیق',false,true,40),
    ('/2nya-nailart/gallery/IMG_3480.jpeg','ناخن نود با جزئیات خطی سبز و نارنجی',false,true,50),
    ('/2nya-nailart/gallery/IMG_3851.jpeg','نود بادامی با قلب‌های سبز مینیمال',false,true,60),
    ('/2nya-nailart/gallery/IMG_4274.jpeg','فرنچ کلاسیک سفید روی فرم مربعی',false,true,70),
    ('/2nya-nailart/gallery/IMG_6567.jpeg','فرنچ شرابی با طراحی خطی سفید ظریف',false,true,80),
    ('/2nya-nailart/gallery/IMG_7072.jpeg','فرنچ متالیک تیره با فرم مربعی',false,true,90),
    ('/2nya-nailart/gallery/IMG_7514.jpeg','فرنچ یاسی با افکت هاله‌ای بنفش',false,true,100),
    ('/2nya-nailart/gallery/IMG_7533.jpeg','ست یاسی یکدست با فرم بادامی کوتاه',false,true,110),
    ('/2nya-nailart/gallery/IMG_9618.jpeg','زیتونی طبیعی با فرم کوتاه و نرم',false,true,120),
    ('/2nya-nailart/gallery/IMG_9864.jpeg','ست مینیمال کاراملی و قهوه‌ای تیره',false,true,130),
    ('/2nya-nailart/gallery/IMG_9866.jpeg','فرنچ شکلاتی روی بیس نود براق',false,true,140)
)
insert into public.nail_2nya_portfolio_items(image_path,alt_text,featured,visible,sort_order)
select s.image_path,s.alt_text,s.featured,s.visible,s.sort_order
from seed s
where not exists (
  select 1 from public.nail_2nya_portfolio_items p where p.image_path=s.image_path
);

with seed(image_path,alt_text,featured,sort_order) as (
  values
    ('/2nya-nailart/gallery/IMG_0761.jpeg','فرم طبیعی فرنچ سفید با بیس صورتی شفاف',true,10),
    ('/2nya-nailart/gallery/IMG_1679.jpeg','فرنچ قرمز مینیمال روی فرم بادامی',false,20),
    ('/2nya-nailart/gallery/IMG_2249.jpeg','فرنچ شیری روی فرم نرم و طبیعی',false,30),
    ('/2nya-nailart/gallery/IMG_2345.jpeg','فرنچ قرمز کلاسیک با جزئیات قرمز عمیق',false,40),
    ('/2nya-nailart/gallery/IMG_3480.jpeg','ناخن نود با جزئیات خطی سبز و نارنجی',false,50),
    ('/2nya-nailart/gallery/IMG_3851.jpeg','نود بادامی با قلب‌های سبز مینیمال',false,60),
    ('/2nya-nailart/gallery/IMG_4274.jpeg','فرنچ کلاسیک سفید روی فرم مربعی',false,70),
    ('/2nya-nailart/gallery/IMG_6567.jpeg','فرنچ شرابی با طراحی خطی سفید ظریف',false,80),
    ('/2nya-nailart/gallery/IMG_7072.jpeg','فرنچ متالیک تیره با فرم مربعی',false,90),
    ('/2nya-nailart/gallery/IMG_7514.jpeg','فرنچ یاسی با افکت هاله‌ای بنفش',false,100),
    ('/2nya-nailart/gallery/IMG_7533.jpeg','ست یاسی یکدست با فرم بادامی کوتاه',false,110),
    ('/2nya-nailart/gallery/IMG_9618.jpeg','زیتونی طبیعی با فرم کوتاه و نرم',false,120),
    ('/2nya-nailart/gallery/IMG_9864.jpeg','ست مینیمال کاراملی و قهوه‌ای تیره',false,130),
    ('/2nya-nailart/gallery/IMG_9866.jpeg','فرنچ شکلاتی روی بیس نود براق',false,140)
)
update public.nail_2nya_portfolio_items p
set alt_text=s.alt_text,featured=s.featured,visible=true,sort_order=s.sort_order
from seed s
where p.image_path=s.image_path;

drop policy if exists "2nya admins select media" on storage.objects;
create policy "2nya admins select media"
on storage.objects for select
to authenticated
using (bucket_id='nail-2nya-media' and public.nail_2nya_is_admin(auth.uid()));

drop policy if exists "2nya admins insert media" on storage.objects;
create policy "2nya admins insert media"
on storage.objects for insert
to authenticated
with check (bucket_id='nail-2nya-media' and public.nail_2nya_is_admin(auth.uid()));

drop policy if exists "2nya admins update media" on storage.objects;
create policy "2nya admins update media"
on storage.objects for update
to authenticated
using (bucket_id='nail-2nya-media' and public.nail_2nya_is_admin(auth.uid()))
with check (bucket_id='nail-2nya-media' and public.nail_2nya_is_admin(auth.uid()));

drop policy if exists "2nya admins delete media" on storage.objects;
create policy "2nya admins delete media"
on storage.objects for delete
to authenticated
using (bucket_id='nail-2nya-media' and public.nail_2nya_is_admin(auth.uid()));
