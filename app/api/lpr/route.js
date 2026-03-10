import { getServiceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// POST /api/lpr — receive plate detection from camera/LPR system
export async function POST(req) {
  const db = getServiceClient();
  const body = await req.json();
  const { plate, make, model, color, confidence, camera_id, image_url, raw_data } = body;

  if (!plate) return NextResponse.json({ error: 'plate is required' }, { status: 400 });

  const normalizedPlate = plate.toUpperCase().replace(/\s/g, '');
  const today = new Date().toISOString().slice(0, 10);

  // Check if plate is registered and active today
  const { data: registrations } = await db
    .from('vehicle_registrations')
    .select('id, unit_booking_id, unit_bookings!inner(check_in, check_out, status)')
    .ilike('plate', normalizedPlate)
    .filter('unit_bookings.status', 'eq', 'confirmed');

  const activeReg = registrations?.find(r => {
    const b = r.unit_bookings;
    return b && b.check_in <= today && b.check_out >= today;
  });

  const isAuthorized = !!activeReg;

  // Save detection
  const { data: detection, error: detErr } = await db
    .from('plate_detections')
    .insert({
      plate: normalizedPlate,
      detected_make: make,
      detected_model: model,
      detected_color: color,
      confidence,
      camera_id: camera_id || 'main',
      image_url,
      raw_data,
      matched_registration_id: activeReg?.id || null,
      is_authorized: isAuthorized,
      processed: true,
    })
    .select()
    .single();

  if (detErr) return NextResponse.json({ error: detErr.message }, { status: 500 });

  // Create violation if unauthorized
  let violation = null;
  if (!isAuthorized) {
    const { data: viol } = await db
      .from('parking_violations')
      .insert({
        plate: normalizedPlate,
        detected_make: make,
        detected_model: model,
        detection_id: detection.id,
        image_url,
        camera_id: camera_id || 'main',
      })
      .select()
      .single();
    violation = viol;
  }

  return NextResponse.json({ detection, violation, is_authorized: isAuthorized });
}

// GET /api/lpr — get recent detections
export async function GET(req) {
  const db = getServiceClient();
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const since = searchParams.get('since');

  let query = db
    .from('plate_detections')
    .select('*, matched_registration_id(plate, make, model, unit_booking_id, unit_bookings(guest_name, parking_units(unit_number)))')
    .order('detected_at', { ascending: false })
    .limit(limit);

  if (since) query = query.gte('detected_at', since);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
