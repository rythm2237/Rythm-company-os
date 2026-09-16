import { NextRequest, NextResponse } from 'next/server';
import { publicClient } from '@/lib/2nya-nailart/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const appointmentId = request.nextUrl.searchParams.get('id');
  const managementCode = request.nextUrl.searchParams.get('token');
  if (!appointmentId || !managementCode) {
    return NextResponse.json({ ok: false, error: 'لینک مدیریت رزرو معتبر نیست.' }, { status: 400 });
  }
  const db = publicClient();
  const bookingResult = await db.rpc('nail_2nya_get_booking', {
    p_appointment_id: appointmentId,
    p_token: managementCode,
  });
  const businessResult = await db.from('nail_2nya_business_profile').select('timezone').limit(1).maybeSingle();
  if (bookingResult.error || !bookingResult.data?.length) {
    return NextResponse.json({ ok: false, error: 'این لینک رزرو معتبر نیست یا منقضی شده است.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, booking: bookingResult.data[0], timezone: businessResult.data?.timezone || 'UTC' }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body?.action !== 'cancel' || !body?.id || !body?.token) {
      return NextResponse.json({ ok: false, error: 'درخواست معتبر نیست.' }, { status: 400 });
    }
    const db = publicClient();
    const result = await db.rpc('nail_2nya_cancel_booking', {
      p_appointment_id: body.id,
      p_token: body.token,
    });
    if (result.error || !result.data) {
      return NextResponse.json({ ok: false, error: 'لغو رزرو انجام نشد.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'درخواست معتبر نیست.' }, { status: 400 });
  }
}
