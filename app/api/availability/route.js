import { getServiceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /api/availability?year=2026
// Returns: { "2026-03-10": { reserved: 3, available: 7, total: 10 }, ... }
export async function GET(req) {
  const db = getServiceClient();
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') || new Date().getFullYear());

  const [settingsRes, reservationsRes] = await Promise.all([
    db.from('parking_settings').select('*'),
    db.from('parking_reservations')
      .select('start_date, end_date')
      .eq('status', 'confirmed')
      .lte('start_date', `${year}-12-31`)
      .gte('end_date', `${year}-01-01`),
  ]);

  const settings = Object.fromEntries((settingsRes.data || []).map(s => [s.key, s.value]));
  const totalSpots = parseInt(settings.total_spots || '10');

  // Build map of date -> reserved count
  const reserved = {};
  const reservations = reservationsRes.data || [];

  for (const r of reservations) {
    const start = new Date(r.start_date);
    const end = new Date(r.end_date);
    const d = new Date(start);
    while (d <= end) {
      const key = d.toISOString().slice(0, 10);
      reserved[key] = (reserved[key] || 0) + 1;
      d.setDate(d.getDate() + 1);
    }
  }

  // Build full year availability
  const result = {};
  const cursor = new Date(`${year}-01-01`);
  const end = new Date(`${year}-12-31`);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    const reservedCount = reserved[key] || 0;
    result[key] = {
      reserved: reservedCount,
      available: Math.max(0, totalSpots - reservedCount),
      total: totalSpots,
    };
    cursor.setDate(cursor.getDate() + 1);
  }

  return NextResponse.json(result);
}
