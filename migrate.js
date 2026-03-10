const https = require('https');

// Use Supabase Management API with personal access token
const PROJECT_REF = 'xocfduqugghailalzlqy';
const PAT = 'sbp_803303e69c9d5ad01cf12adcc6ad17747bd38d03';

async function runSQL(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PAT}`,
        'Content-Length': Buffer.byteLength(body),
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const statements = [
  {
    label: 'parking_units table',
    sql: `CREATE TABLE IF NOT EXISTS parking_units (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unit_number text NOT NULL,
      floor text,
      unit_type text DEFAULT 'standard',
      is_active boolean DEFAULT true,
      sort_order int DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      CONSTRAINT parking_units_number_unique UNIQUE (unit_number)
    )`
  },
  {
    label: 'parking_spots table',
    sql: `CREATE TABLE IF NOT EXISTS parking_spots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      spot_number text NOT NULL,
      is_active boolean DEFAULT true,
      notes text,
      created_at timestamptz DEFAULT now(),
      CONSTRAINT parking_spots_number_unique UNIQUE (spot_number)
    )`
  },
  {
    label: 'unit_bookings table',
    sql: `CREATE TABLE IF NOT EXISTS unit_bookings (
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
    )`
  },
  {
    label: 'parking_reservations table',
    sql: `CREATE TABLE IF NOT EXISTS parking_reservations (
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
    )`
  },
  {
    label: 'parking_settings table',
    sql: `CREATE TABLE IF NOT EXISTS parking_settings (
      key text PRIMARY KEY,
      value text,
      updated_at timestamptz DEFAULT now()
    )`
  },
  {
    label: 'seed settings',
    sql: `INSERT INTO parking_settings (key, value) VALUES ('total_spots', '10') ON CONFLICT (key) DO NOTHING;
          INSERT INTO parking_settings (key, value) VALUES ('property_name', 'Building') ON CONFLICT (key) DO NOTHING`
  },
  {
    label: 'disable RLS on all tables',
    sql: `ALTER TABLE parking_units DISABLE ROW LEVEL SECURITY;
          ALTER TABLE parking_spots DISABLE ROW LEVEL SECURITY;
          ALTER TABLE unit_bookings DISABLE ROW LEVEL SECURITY;
          ALTER TABLE parking_reservations DISABLE ROW LEVEL SECURITY;
          ALTER TABLE parking_settings DISABLE ROW LEVEL SECURITY`
  },
];

async function migrate() {
  console.log('Running migration via Supabase Management API...\n');
  for (const { label, sql } of statements) {
    const res = await runSQL(sql);
    const ok = res.status === 200 || res.status === 201;
    console.log(`${ok ? '✓' : '✗'} ${label} [${res.status}]`);
    if (!ok) console.log('  ', res.body.substring(0, 300));
  }
  console.log('\nMigration complete.');
}

migrate().catch(console.error);
