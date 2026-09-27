-- Align the managed portfolio seed with the gallery that was actually live
-- immediately before admin gallery management was introduced. Uploaded
-- storage-backed items are intentionally preserved.

update public.nail_2nya_portfolio_items
set visible=false
where image_path not like 'storage:%'
  and image_path not in (
    '/2nya-nailart/gallery/IMG_0769.jpeg',
    '/2nya-media/portfolio-new-02.webp',
    '/api/2nya-nailart/media/portfolio-01.webp',
    '/api/2nya-nailart/media/portfolio-02.webp',
    '/api/2nya-nailart/media/portfolio-03.webp',
    '/api/2nya-nailart/media/portfolio-04.webp',
    '/2nya-nailart/gallery/IMG_0761.jpeg',
    '/2nya-nailart/gallery/IMG_0762.jpeg',
    '/2nya-nailart/gallery/IMG_0763.jpeg',
    '/2nya-nailart/gallery/IMG_0764.jpeg',
    '/2nya-nailart/gallery/IMG_0765.jpeg',
    '/2nya-nailart/gallery/IMG_0766.jpeg',
    '/2nya-nailart/gallery/IMG_0767.jpeg',
    '/2nya-nailart/gallery/IMG_0768.jpeg'
  );

with seed(image_path,alt_text,featured,sort_order) as (
  values
    ('/2nya-nailart/gallery/IMG_0769.jpeg','ترکیب رنگ جسورانه و ظریف',true,10),
    ('/2nya-media/portfolio-new-02.webp','طراحی شخصیت و جزئیات دست‌ساز',false,20),
    ('/api/2nya-nailart/media/portfolio-01.webp','طراحی مینیمال روزمره',false,30),
    ('/api/2nya-nailart/media/portfolio-02.webp','درخشش آبی و بافت ظریف',false,40),
    ('/api/2nya-nailart/media/portfolio-03.webp','جزئیات هنری و فانتزی',false,50),
    ('/api/2nya-nailart/media/portfolio-04.webp','ترکیب رنگ و فرم مدرن',false,60),
    ('/2nya-nailart/gallery/IMG_0761.jpeg','نقاشی ظریف و دست‌ساز روی ناخن',false,70),
    ('/2nya-nailart/gallery/IMG_0762.jpeg','طراحی اختصاصی ناخن، اثر دنیا',false,80),
    ('/2nya-nailart/gallery/IMG_0763.jpeg','جزئیات رنگ و تصویرسازی ناخن',false,90),
    ('/2nya-nailart/gallery/IMG_0764.jpeg','اجرای طراحی هنری ناخن',false,100),
    ('/2nya-nailart/gallery/IMG_0765.jpeg','طراحی رنگی و ظریف ناخن',false,110),
    ('/2nya-nailart/gallery/IMG_0766.jpeg','نمونه طراحی خلاقانه ناخن',false,120),
    ('/2nya-nailart/gallery/IMG_0767.jpeg','ظرافت در طراحی ناخن',false,130),
    ('/2nya-nailart/gallery/IMG_0768.jpeg','نمونه‌کار دست‌ساز دنیا',false,140)
)
insert into public.nail_2nya_portfolio_items(image_path,alt_text,featured,visible,sort_order)
select s.image_path,s.alt_text,s.featured,true,s.sort_order
from seed s
where not exists (
  select 1 from public.nail_2nya_portfolio_items p where p.image_path=s.image_path
);

with seed(image_path,alt_text,featured,sort_order) as (
  values
    ('/2nya-nailart/gallery/IMG_0769.jpeg','ترکیب رنگ جسورانه و ظریف',true,10),
    ('/2nya-media/portfolio-new-02.webp','طراحی شخصیت و جزئیات دست‌ساز',false,20),
    ('/api/2nya-nailart/media/portfolio-01.webp','طراحی مینیمال روزمره',false,30),
    ('/api/2nya-nailart/media/portfolio-02.webp','درخشش آبی و بافت ظریف',false,40),
    ('/api/2nya-nailart/media/portfolio-03.webp','جزئیات هنری و فانتزی',false,50),
    ('/api/2nya-nailart/media/portfolio-04.webp','ترکیب رنگ و فرم مدرن',false,60),
    ('/2nya-nailart/gallery/IMG_0761.jpeg','نقاشی ظریف و دست‌ساز روی ناخن',false,70),
    ('/2nya-nailart/gallery/IMG_0762.jpeg','طراحی اختصاصی ناخن، اثر دنیا',false,80),
    ('/2nya-nailart/gallery/IMG_0763.jpeg','جزئیات رنگ و تصویرسازی ناخن',false,90),
    ('/2nya-nailart/gallery/IMG_0764.jpeg','اجرای طراحی هنری ناخن',false,100),
    ('/2nya-nailart/gallery/IMG_0765.jpeg','طراحی رنگی و ظریف ناخن',false,110),
    ('/2nya-nailart/gallery/IMG_0766.jpeg','نمونه طراحی خلاقانه ناخن',false,120),
    ('/2nya-nailart/gallery/IMG_0767.jpeg','ظرافت در طراحی ناخن',false,130),
    ('/2nya-nailart/gallery/IMG_0768.jpeg','نمونه‌کار دست‌ساز دنیا',false,140)
)
update public.nail_2nya_portfolio_items p
set alt_text=s.alt_text,featured=s.featured,visible=true,sort_order=s.sort_order
from seed s
where p.image_path=s.image_path;
