import { getServiceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function PATCH(req, { params }) {
  const db = getServiceClient();
  const body = await req.json();
  const { data, error } = await db.from('parking_units').update(body).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req, { params }) {
  const db = getServiceClient();
  const { error } = await db.from('parking_units').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
