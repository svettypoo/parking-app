import { getServiceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(req, { params }) {
  const db = getServiceClient();
  const { data, error } = await db
    .from('unit_bookings')
    .select('*, parking_units(unit_number, floor), parking_reservations(*, parking_spots(*)), vehicle_registrations(*)')
    .eq('id', params.id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req, { params }) {
  const db = getServiceClient();
  const body = await req.json();
  const { data, error } = await db
    .from('unit_bookings')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req, { params }) {
  const db = getServiceClient();
  const { error } = await db.from('unit_bookings').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
