'use client';
import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState({ total_spots: '10', property_name: 'Building' });
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newSpot, setNewSpot] = useState('');

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(data => { if (typeof data === 'object') setSettings(s => ({ ...s, ...data })); setLoading(false); });
    fetch('/api/spots').then(r => r.json()).then(data => setSpots(Array.isArray(data) ? data : []));
  }, []);

  const save = async () => {
    setSaving(true);
    await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addSpot = async () => {
    if (!newSpot.trim()) return;
    await fetch('/api/spots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spot_number: newSpot.trim() }) });
    setNewSpot('');
    fetch('/api/spots').then(r => r.json()).then(setSpots);
  };

  if (loading) return <div className="text-center py-8 text-slate-400">Loading...</div>;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Configure parking capacity and property details</p>
      </div>

      {/* General */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h3 className="font-semibold text-slate-800">General</h3>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Property Name</label>
          <input value={settings.property_name || ''} onChange={e => setSettings(s => ({ ...s, property_name: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Ocean View Resort" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Total Parking Spots</label>
          <input type="number" min="1" value={settings.total_spots || '10'} onChange={e => setSettings(s => ({ ...s, total_spots: e.target.value }))} className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-slate-400 mt-1">This is used to calculate parking availability per day on the grid.</p>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          <Save className="w-4 h-4" />
          {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Parking Spots (named) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h3 className="font-semibold text-slate-800">Named Parking Spots (optional)</h3>
        <p className="text-xs text-slate-400">If you want to track individual spots by number, add them here. If left empty, spots are managed by the total count above.</p>
        <div className="flex gap-2">
          <input value={newSpot} onChange={e => setNewSpot(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSpot()} placeholder="Spot number, e.g. P1" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={addSpot} disabled={!newSpot.trim()} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 disabled:opacity-40">Add</button>
        </div>
        {spots.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {spots.map(s => (
              <div key={s.id} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">{s.spot_number}</div>
            ))}
          </div>
        )}
      </div>

      {/* API Webhook */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h3 className="font-semibold text-slate-800">External Booking API</h3>
        <p className="text-xs text-slate-500">When your booking system creates a unit booking, POST to this endpoint to sync it here. The guest will automatically receive a parking URL.</p>
        <div className="bg-slate-50 rounded-lg p-3 font-mono text-xs text-slate-600 border border-slate-200">
          <div className="font-bold text-slate-700 mb-1">POST /api/bookings</div>
          <pre className="whitespace-pre-wrap">{`{
  "unit_id": "<uuid>",
  "booking_ref": "RES-001",
  "guest_name": "John Smith",
  "guest_email": "john@example.com",
  "guest_phone": "+1 555-0100",
  "check_in": "2026-06-01",
  "check_out": "2026-06-07",
  "source": "api",
  "booking_type": "guest"
}`}</pre>
          <div className="mt-2 text-slate-500">Returns: booking record with <code>parking_token</code> → guest URL: <code>/park/{`{parking_token}`}</code></div>
        </div>
      </div>
    </div>
  );
}
