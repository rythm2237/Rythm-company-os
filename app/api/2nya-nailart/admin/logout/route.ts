import { NextRequest,NextResponse } from 'next/server';
import { sessionClient } from '@/lib/2nya-nailart/server';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){const response=NextResponse.json({ok:true});const db=sessionClient(request,response);await db.auth.signOut();return response}
