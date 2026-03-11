import { getServiceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM || 'noreply@inboxai-mail.dedyn.io';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';

function buildReminderEmail({ guestName, checkIn, checkOut, parkingUrl, propertyName, instructions, unitNumber }) {
  const name = guestName || 'Guest';
  const property = propertyName || 'Our Property';
  const instructionsHtml = instructions
    ? `<div style="background:#f0f9ff;border-left:4px solid #0ea5e9;padding:14px 16px;border-radius:0 8px 8px 0;margin:20px 0;">
        <p style="margin:0;font-size:14px;color:#0c4a6e;font-weight:600;">Parking Instructions</p>
        <p style="margin:8px 0 0;font-size:14px;color:#075985;">${instructions.replace(/\n/g, '<br>')}</p>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0ea5e9,#06b6d4);padding:32px 36px;">
      <div style="font-size:28px;margin-bottom:4px;">🅿️</div>
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Your Parking Reminder</h1>
      <p style="margin:6px 0 0;color:#bae6fd;font-size:14px;">${property}</p>
    </div>
    <div style="padding:32px 36px;">
      <p style="margin:0 0 16px;color:#1e293b;font-size:16px;">Hi ${name},</p>
      <p style="margin:0 0 20px;color:#475569;font-size:15px;">Your stay is coming up. Here's everything you need to know about parking:</p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:20px;">
        <div style="display:flex;gap:24px;flex-wrap:wrap;">
          <div>
            <p style="margin:0;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Check-in</p>
            <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#0f172a;">${checkIn}</p>
          </div>
          <div>
            <p style="margin:0;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Check-out</p>
            <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#0f172a;">${checkOut}</p>
          </div>
          ${unitNumber ? `<div>
            <p style="margin:0;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Unit</p>
            <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#0f172a;">${unitNumber}</p>
          </div>` : ''}
        </div>
      </div>

      ${instructionsHtml}

      <div style="text-align:center;margin:28px 0;">
        <a href="${parkingUrl}" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#06b6d4);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:.3px;">View My Parking Portal →</a>
      </div>

      <p style="margin:0;color:#94a3b8;font-size:13px;">Your parking portal lets you register your vehicle plate, check availability, and find your stall assignment. Open it any time from your phone.</p>
    </div>
    <div style="padding:16px 36px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;color:#cbd5e1;font-size:12px;">Sent by ${property} Parking Management</p>
    </div>
  </div>
</body>
</html>`;
}

// POST /api/reminders — send reminder email for a booking
// Body: { booking_id }
export async function POST(req) {
  const db = getServiceClient();
  const { booking_id } = await req.json();

  if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 });

  const { data: booking, error: bErr } = await db
    .from('unit_bookings')
    .select('*, parking_units(unit_number)')
    .eq('id', booking_id)
    .single();

  if (bErr || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  if (!booking.guest_email) return NextResponse.json({ error: 'Booking has no guest email' }, { status: 400 });

  const { data: settingsRows } = await db.from('parking_settings').select('*');
  const settings = Object.fromEntries((settingsRows || []).map(s => [s.key, s.value]));

  const parkingUrl = `${APP_URL}/park/${booking.parking_token}`;

  const html = buildReminderEmail({
    guestName: booking.guest_name,
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    parkingUrl,
    propertyName: settings.property_name,
    instructions: settings.parking_instructions,
    unitNumber: booking.parking_units?.unit_number,
  });

  const { error: emailErr } = await resend.emails.send({
    from: FROM,
    to: booking.guest_email,
    subject: `🅿️ Parking reminder for your stay at ${settings.property_name || 'our property'}`,
    html,
  });

  if (emailErr) return NextResponse.json({ error: emailErr.message }, { status: 500 });

  // Log the send
  await db.from('parking_settings').upsert(
    [{ key: `reminder_sent_${booking_id}`, value: new Date().toISOString(), updated_at: new Date().toISOString() }],
    { onConflict: 'key' }
  );

  return NextResponse.json({ ok: true, sent_to: booking.guest_email });
}

// GET /api/reminders — find bookings due for auto-reminders and send them
// Called by cron or admin to process pending reminders
export async function GET(req) {
  const db = getServiceClient();
  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get('dry_run') === '1';

  const { data: settingsRows } = await db.from('parking_settings').select('*');
  const settings = Object.fromEntries((settingsRows || []).map(s => [s.key, s.value]));
  const daysBefore = parseInt(settings.reminder_days_before || '3');

  if (daysBefore === 0) return NextResponse.json({ skipped: true, reason: 'reminder_days_before is 0' });

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysBefore);
  const targetDateStr = targetDate.toISOString().slice(0, 10);

  const { data: bookings, error } = await db
    .from('unit_bookings')
    .select('*, parking_units(unit_number)')
    .eq('check_in', targetDateStr)
    .eq('status', 'confirmed')
    .not('guest_email', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const booking of bookings || []) {
    const alreadySentKey = `reminder_sent_${booking.id}`;
    if (settings[alreadySentKey]) {
      results.push({ booking_id: booking.id, status: 'already_sent' });
      continue;
    }
    if (dryRun) {
      results.push({ booking_id: booking.id, guest_email: booking.guest_email, status: 'would_send' });
      continue;
    }
    const r = await fetch(`${APP_URL}/api/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: booking.id }),
    });
    const json = await r.json();
    results.push({ booking_id: booking.id, ...json });
  }

  return NextResponse.json({ processed: results.length, results });
}
