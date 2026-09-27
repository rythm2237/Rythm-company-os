import { NextResponse } from 'next/server';
import { publicClient } from '@/lib/2nya-nailart/server';

export const dynamic='force-dynamic';

const BUCKET='nail-2nya-media';

function publicImageUrl(supabase:ReturnType<typeof publicClient>,imagePath:string){
  if(!imagePath.startsWith('storage:'))return imagePath;
  const objectPath=imagePath.slice('storage:'.length);
  return supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
}

export async function GET(){
  try{
    const supabase=publicClient();
    const {data,error}=await supabase
      .from('nail_2nya_portfolio_items')
      .select('id,image_path,alt_text,sort_order')
      .eq('visible',true)
      .order('sort_order',{ascending:true})
      .order('created_at',{ascending:true});
    if(error)throw error;
    const items=(data||[]).map(row=>({
      id:row.id,
      src:publicImageUrl(supabase,row.image_path),
      title:row.alt_text||'نمونه طراحی ناخن Donya Nail Art',
      sort_order:row.sort_order,
    }));
    return NextResponse.json({ok:true,items},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    console.error('2nya portfolio GET failed',error);
    return NextResponse.json({ok:false,error:'Portfolio could not be loaded.'},{status:500,headers:{'Cache-Control':'no-store'}});
  }
}
