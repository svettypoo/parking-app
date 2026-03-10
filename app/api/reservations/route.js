import { getServiceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(req) {
  const db = getServiceClient();
  const { searchParams } = new URL(req.url);
  const booking_id = searchParams.get('booking_id');
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  let query = db
    .from('parking_reservations')
    .select('*, parking_spots(spot_number), unit_bookings(guest_name, unit_id, booking_type, parking_units(unit_number))')
    .eq('status', 'confirmed');

  if (booking_id) query = query.eq('unit_booking_id', booking_id);
  if (start) query = query.lte('start_date', end || start).gte('end_date', start);

  const { data, error } = await query.order('start_date');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req) {
  const db = getServiceClient();
  const body = await req.json();
  const { data, error } = await db.from('parking_reservations').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
