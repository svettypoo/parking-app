import { getServiceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(req) {
  const db = getServiceClient();
  const { searchParams } = new URL(req.url);
  const unit_id = searchParams.get('unit_id');
  const year = searchParams.get('year') || new Date().getFullYear();

  let query = db
    .from('unit_bookings')
    .select('*, parking_units(unit_number, floor)')
    .order('check_in');

  if (unit_id) query = query.eq('unit_id', unit_id);

  // Filter by year overlap
  query = query
    .lte('check_in', `${year}-12-31`)
    .gte('check_out', `${year}-01-01`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req) {
  const db = getServiceClient();
  const body = await req.json();
  const { data, error } = await db.from('unit_bookings').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
