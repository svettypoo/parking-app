'use client';
import { useState, useEffect } from 'react';
import { Car, CheckCircle, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';

export default function GuestParkingPortal() {
  const params = useParams();
  const token = params.token;

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [availability, setAvailability] = useState({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);

  // New vehicle form
  const [vForm, setVForm] = useState({ plate: '', make: '', model: '', color: '', is_primary: true });

  // Parking dates (default to booking dates)
  const [parkDates, setParkDates] = useState({ start: '', end: '' });

  useEffect(() => {
    if (!token) return;
    fetch(`/api/guest/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return; }
        setBooking(data);
        setVehicles(data.vehicle_registrations || []);
        setReservations(data.parking_reservations || []);
        setParkDates({ start: data.check_in, end: data.check_out });
        // Load availability for booking period year
        const year = data.check_in?.split('-')[0];
        if (year) fetch(`/api/availability?year=${year}`).then(r => r.json()).then(setAvailability);
        setLoading(false);
      })
      .catch(() => { setError('Failed to load booking. Please check the link.'); setLoading(false); });
  }, [token]);

  const addVehicle = async () => {
    if (!vForm.plate) return;
    setSaving(true);
    const res = await fetch('/api/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...vForm, plate: vForm.plate.toUpperCase().replace(/\s/g, ''), unit_booking_id: booking.id }),
    }).then(r => r.json());
    setSaving(false);
    if (res.error) { alert(res.error); return; }
    setVehicles(v => [...v, res]);
    setVForm({ plate: '', make: '', model: '', color: '', is_primary: true });
    setSuccess('Vehicle registered!');
    setTimeout(() => setSuccess(null), 3000);
  };

  const removeVehicle = async (id) => {
    await fetch(`/api/vehicles?id=${id}`, { method: 'DELETE' });
    setVehicles(v => v.filter(x => x.id !== id));
  };

  const requestParking = async () => {
    if (!parkDates.start || !parkDates.end) { alert('Please select parking dates'); return; }
    if (vehicles.length === 0) { alert('Please register at least one vehicle first'); return; }

    // Check availability
    const avail = availability[parkDates.start];
    if (avail && avail.available === 0) { alert('Sorry, no parking available for your requested dates.'); return; }

    setSaving(true);
    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_booking_id: booking.id, start_date: parkDates.start, end_date: parkDates.end }),
    }).then(r => r.json());
    setSaving(false);
    if (res.error) { alert(res.error); return; }
    setReservations(r => [...r, res]);
    setSuccess('Parking reserved! You\'re all set.');
    setTimeout(() => setSuccess(null), 5000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Car className="w-8 h-8 animate-pulse text-blue-500" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Booking Not Found</h2>
          <p className="text-slate-500">{error || 'This parking link is invalid or has expired.'}</p>
        </div>
      </div>
    );
  }

  const hasParking = reservations.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <Car className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-slate-900">Resort Parking</div>
            <div className="text-xs text-slate-400">Guest Portal</div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Success banner */}
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <p className="text-emerald-700 font-medium">{success}</p>
          </div>
        )}

        {/* Booking Info */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-bold text-lg text-slate-900 mb-3">Your Booking</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-400 mb-0.5">Guest</div>
              <div className="font-medium text-slate-900">{booking.guest_name || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-0.5">Unit</div>
              <div className="font-medium text-slate-900">{booking.parking_units?.unit_number || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-0.5">Check-in</div>
              <div className="font-medium text-slate-900">{booking.check_in}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-0.5">Check-out</div>
              <div className="font-medium text-slate-900">{booking.check_out}</div>
            </div>
            {booking.booking_ref && (
              <div className="col-span-2">
                <div className="text-xs text-slate-400 mb-0.5">Booking Ref</div>
                <div className="font-mono text-slate-900">{booking.booking_ref}</div>
              </div>
            )}
          </div>
        </div>

        {/* Existing Parking Reservation */}
        {hasParking && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <h3 className="font-bold text-emerald-900">Parking Confirmed</h3>
            </div>
            {reservations.map(r => (
              <div key={r.id} className="text-sm text-emerald-700">
                <p>{r.start_date} → {r.end_date}</p>
                {r.parking_spots?.spot_number && <p className="font-medium">Spot #{r.parking_spots.spot_number}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Vehicle Registration */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-1">Register Your Vehicle(s)</h3>
          <p className="text-sm text-slate-500 mb-4">Register up to 2 vehicles. Only 1 may be in the lot at a time. Your plates will be automatically recognized by our camera system.</p>

          {/* Existing vehicles */}
          {vehicles.length > 0 && (
            <div className="space-y-2 mb-4">
              {vehicles.map(v => (
                <div key={v.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
                  <Car className="w-4 h-4 text-slate-400" />
                  <div className="flex-1">
                    <span className="font-mono font-bold text-slate-900">{v.plate}</span>
                    {(v.make || v.model) && <span className="text-sm text-slate-500 ml-2">{[v.make, v.model].filter(Boolean).join(' ')}</span>}
                    {v.color && <span className="text-sm text-slate-400 ml-1">· {v.color}</span>}
                  </div>
                  {v.is_primary && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Primary</span>}
                  <button onClick={() => removeVehicle(v.id)} className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add vehicle */}
          {vehicles.length < 2 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">License Plate *</label>
                  <input value={vForm.plate} onChange={e => setVForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))} placeholder="ABC 123" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Color</label>
                  <input value={vForm.color} onChange={e => setVForm(f => ({ ...f, color: e.target.value }))} placeholder="e.g. White" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Make</label>
                  <input value={vForm.make} onChange={e => setVForm(f => ({ ...f, make: e.target.value }))} placeholder="e.g. Toyota" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Model</label>
                  <input value={vForm.model} onChange={e => setVForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. Camry" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {vehicles.length === 1 && (
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={!vForm.is_primary} onChange={e => setVForm(f => ({ ...f, is_primary: !e.target.checked }))} className="rounded" />
                  This is my secondary vehicle
                </label>
              )}
              <button onClick={addVehicle} disabled={saving || !vForm.plate} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 disabled:opacity-40">
                <Plus className="w-4 h-4" /> {saving ? 'Saving...' : 'Register Vehicle'}
              </button>
            </div>
          )}
          {vehicles.length >= 2 && (
            <p className="text-sm text-slate-400 italic">Maximum 2 vehicles registered.</p>
          )}
        </div>

        {/* Request Parking */}
        {!hasParking && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-1">Reserve Parking</h3>
            <p className="text-sm text-slate-500 mb-4">Select the dates you'll need parking. Dates are pre-filled from your booking.</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Parking from</label>
                <input type="date" value={parkDates.start} min={booking.check_in} max={booking.check_out} onChange={e => setParkDates(d => ({ ...d, start: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Parking until</label>
                <input type="date" value={parkDates.end} min={parkDates.start || booking.check_in} max={booking.check_out} onChange={e => setParkDates(d => ({ ...d, end: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            {parkDates.start && availability[parkDates.start] && (
              <div className={`mb-3 px-3 py-2 rounded-lg text-sm ${availability[parkDates.start].available > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {availability[parkDates.start].available > 0
                  ? `✓ ${availability[parkDates.start].available} spots available on ${parkDates.start}`
                  : `✗ No spots available on ${parkDates.start}`}
              </div>
            )}
            <button onClick={requestParking} disabled={saving || vehicles.length === 0 || !parkDates.start || !parkDates.end} className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors">
              {saving ? 'Reserving...' : 'Confirm Parking Reservation'}
            </button>
            {vehicles.length === 0 && (
              <p className="text-xs text-center text-slate-400 mt-2">Register your vehicle above first</p>
            )}
          </div>
        )}

        {/* Rules */}
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 text-sm text-slate-600 space-y-2">
          <h4 className="font-semibold text-slate-800">Parking Rules</h4>
          <ul className="space-y-1 list-disc list-inside text-slate-500">
            <li>You may register up to 2 vehicles per booking</li>
            <li>Only 1 vehicle may be in the lot at a time</li>
            <li>Unregistered vehicles will receive a violation notice</li>
            <li>Parking is available only for your check-in/check-out dates</li>
            <li>Contact the front desk for any parking assistance</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
