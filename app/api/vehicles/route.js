import { getServiceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(req) {
  const db = getServiceClient();
  const { searchParams } = new URL(req.url);
  const booking_id = searchParams.get('booking_id');

  let query = db.from('vehicle_registrations').select('*, unit_bookings(guest_name, check_in, check_out, parking_units(unit_number))');
  if (booking_id) query = query.eq('unit_booking_id', booking_id);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req) {
  const db = getServiceClient();
  const body = await req.json();

  // Max 2 plates per booking
  const { data: existing } = await db
    .from('vehicle_registrations')
    .select('id')
    .eq('unit_booking_id', body.unit_booking_id);

  if (existing && existing.length >= 2) {
    return NextResponse.json({ error: 'Maximum 2 vehicles per booking' }, { status: 400 });
  }

  const { data, error } = await db.from('vehicle_registrations').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req) {
  const db = getServiceClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const { error } = await db.from('vehicle_registrations').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
