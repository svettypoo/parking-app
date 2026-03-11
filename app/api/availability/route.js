import { getServiceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// Returns the stall limit for a given date, applying seasonal rules.
// seasonal_rules is a JSON array in parking_settings:
//   [{ name, start_month (1-12), end_month (1-12), max_stalls }]
// First matching rule wins. Falls back to total_spots.
function getStallLimit(date, totalSpots, seasonalRules) {
  const month = date.getMonth() + 1;
  for (const rule of seasonalRules) {
    const sm = parseInt(rule.start_month);
    const em = parseInt(rule.end_month);
    const limit = parseInt(rule.max_stalls);
    if (sm <= em) {
      if (month >= sm && month <= em) return { limit, name: rule.name };
    } else {
      // Wraps year-end e.g. Nov→Feb
      if (month >= sm || month <= em) return { limit, name: rule.name };
    }
  }
  return { limit: totalSpots, name: null };
}

// GET /api/availability?year=2026
// Returns: { "2026-03-10": { reserved, available, total, season_name }, ... }
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

  let seasonalRules = [];
  try { seasonalRules = JSON.parse(settings.seasonal_rules || '[]'); } catch { /* ignore */ }

  // Build map of date -> reserved count
  const reserved = {};
  for (const r of reservationsRes.data || []) {
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
  const yearEnd = new Date(`${year}-12-31`);
  while (cursor <= yearEnd) {
    const key = cursor.toISOString().slice(0, 10);
    const { limit, name } = getStallLimit(cursor, totalSpots, seasonalRules);
    const reservedCount = reserved[key] || 0;
    result[key] = {
      reserved: reservedCount,
      available: Math.max(0, limit - reservedCount),
      total: limit,
      season_name: name,
    };
    cursor.setDate(cursor.getDate() + 1);
  }

  return NextResponse.json(result);
}
