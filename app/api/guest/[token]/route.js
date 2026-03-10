import { getServiceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// Public endpoint — returns booking info by token (no auth required)
export async function GET(req, { params }) {
  const db = getServiceClient();
  const { data, error } = await db
    .from('unit_bookings')
    .select('id, guest_name, guest_email, guest_phone, check_in, check_out, booking_ref, notes, status, booking_type, parking_units(unit_number, floor), parking_reservations(id, start_date, end_date, parking_spots(spot_number)), vehicle_registrations(*)')
    .eq('parking_token', params.token)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  return NextResponse.json(data);
}
