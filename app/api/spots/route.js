import { getServiceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET() {
  const db = getServiceClient();
  const { data, error } = await db.from('parking_spots').select('*').eq('is_active', true).order('spot_number');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req) {
  const db = getServiceClient();
  const body = await req.json();
  const { data, error } = await db.from('parking_spots').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
