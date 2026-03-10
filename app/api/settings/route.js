import { getServiceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET() {
  const db = getServiceClient();
  const { data, error } = await db.from('parking_settings').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(Object.fromEntries(data.map(s => [s.key, s.value])));
}

export async function PATCH(req) {
  const db = getServiceClient();
  const body = await req.json();

  const updates = Object.entries(body).map(([key, value]) => ({ key, value: String(value), updated_at: new Date().toISOString() }));
  const { error } = await db.from('parking_settings').upsert(updates, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
