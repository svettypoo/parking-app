import { getServiceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = getServiceClient();

  // Create tables via raw SQL using the service role
  const statements = [
    `CREATE TABLE IF NOT EXISTS parking_units (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unit_number text NOT NULL,
      floor text,
      unit_type text DEFAULT 'standard',
      is_active boolean DEFAULT true,
      sort_order int DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      CONSTRAINT parking_units_number_unique UNIQUE (unit_number)
    )`,
    `CREATE TABLE IF NOT EXISTS parking_spots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      spot_number text NOT NULL,
      is_active boolean DEFAULT true,
      notes text,
      created_at timestamptz DEFAULT now(),
      CONSTRAINT parking_spots_number_unique UNIQUE (spot_number)
    )`,
    `CREATE TABLE IF NOT EXISTS unit_bookings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unit_id uuid REFERENCES parking_units(id) ON DELETE SET NULL,
      booking_ref text,
      guest_name text,
      guest_email text,
      guest_phone text,
      check_in date NOT NULL,
      check_out date NOT NULL,
      source text DEFAULT 'manual',
      api_data jsonb,
      parking_token text UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
      notes text,
      status text DEFAULT 'confirmed',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS parking_reservations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unit_booking_id uuid REFERENCES unit_bookings(id) ON DELETE CASCADE,
      parking_spot_id uuid REFERENCES parking_spots(id) ON DELETE SET NULL,
      start_date date NOT NULL,
      end_date date NOT NULL,
      vehicle_plate text,
      vehicle_make text,
      notes text,
      status text DEFAULT 'confirmed',
      created_at timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS parking_settings (
      key text PRIMARY KEY,
      value text,
      updated_at timestamptz DEFAULT now()
    )`,
    `INSERT INTO parking_settings (key, value) VALUES ('total_spots', '10') ON CONFLICT (key) DO NOTHING`,
    `INSERT INTO parking_settings (key, value) VALUES ('property_name', 'Building') ON CONFLICT (key) DO NOTHING`,
  ];

  for (const sql of statements) {
    const { error } = await supabase.rpc('exec_sql', { sql }).catch(() => ({ error: null }));
    if (error) {
      // Try direct approach
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ sql }),
      });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const supabase = getServiceClient();
  const { error } = await supabase.from('parking_units').select('id').limit(1);
  return NextResponse.json({ ready: !error });
}
