import { getServiceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(req) {
  const db = getServiceClient();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'open';
  const limit = parseInt(searchParams.get('limit') || '100');

  let query = db
    .from('parking_violations')
    .select('*')
    .order('violation_at', { ascending: false })
    .limit(limit);

  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req) {
  const db = getServiceClient();
  const body = await req.json();
  const { id, ...updates } = body;

  const { data, error } = await db
    .from('parking_violations')
    .update({ ...updates, resolved_at: updates.status === 'resolved' ? new Date().toISOString() : null })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
