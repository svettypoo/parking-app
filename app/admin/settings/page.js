'use client';
import { useState, useEffect } from 'react';
import { Save, Plus, Trash2 } from 'lucide-react';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const BLANK_RULE = { name: '', start_month: 1, end_month: 12, max_stalls: 10 };

export default function SettingsPage() {
  const [settings, setSettings] = useState({ total_spots: '10', property_name: 'Building', reminder_days_before: '3', parking_instructions: '' });
  const [seasonalRules, setSeasonalRules] = useState([]);
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newSpot, setNewSpot] = useState('');

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(data => {
      if (typeof data === 'object') {
        setSettings(s => ({ ...s, ...data }));
        try { setSeasonalRules(JSON.parse(data.seasonal_rules || '[]')); } catch { /* ignore */ }
      }
      setLoading(false);
    });
    fetch('/api/spots').then(r => r.json()).then(data => setSpots(Array.isArray(data) ? data : []));
  }, []);

  const save = async () => {
    setSaving(true);
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, seasonal_rules: JSON.stringify(seasonalRules) }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addRule = () => setSeasonalRules(r => [...r, { ...BLANK_RULE }]);
  const removeRule = i => setSeasonalRules(r => r.filter((_, idx) => idx !== i));
  const updateRule = (i, field, value) =>
    setSeasonalRules(r => r.map((rule, idx) => idx === i ? { ...rule, [field]: value } : rule));

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
        <p className="text-sm text-slate-500">Configure parking capacity, seasonal limits, and reminders</p>
      </div>

      {/* General */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h3 className="font-semibold text-slate-800">General</h3>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Property Name</label>
          <input value={settings.property_name || ''} onChange={e => setSettings(s => ({ ...s, property_name: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Ocean View Resort" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Default Total Parking Stalls</label>
          <input type="number" min="1" value={settings.total_spots || '10'} onChange={e => setSettings(s => ({ ...s, total_spots: e.target.value }))} className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-slate-400 mt-1">Applied on dates not covered by a seasonal rule below.</p>
        </div>
      </div>

      {/* Seasonal Stall Limits */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800">Seasonal Stall Limits</h3>
            <p className="text-xs text-slate-400 mt-0.5">Override the stall count for specific months. First matching rule wins.</p>
          </div>
          <button onClick={addRule} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200">
            <Plus className="w-3.5 h-3.5" /> Add Rule
          </button>
        </div>

        {seasonalRules.length === 0 && (
          <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
            No seasonal rules. Click <strong>Add Rule</strong> to restrict stalls during peak or off seasons.
          </div>
        )}

        <div className="space-y-3">
          {seasonalRules.map((rule, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1">Season Name</label>
                  <input value={rule.name} onChange={e => updateRule(i, 'name', e.target.value)} placeholder="e.g. Peak Season" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1">Start Month</label>
                  <select value={rule.start_month} onChange={e => updateRule(i, 'start_month', parseInt(e.target.value))} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {MONTHS.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1">End Month</label>
                  <select value={rule.end_month} onChange={e => updateRule(i, 'end_month', parseInt(e.target.value))} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {MONTHS.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1">Max Stalls</label>
                  <input type="number" min="0" value={rule.max_stalls} onChange={e => updateRule(i, 'max_stalls', e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <button onClick={() => removeRule(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {seasonalRules.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            <strong>Active rules:</strong> {seasonalRules.map(r => `${r.name || 'Unnamed'} (${MONTHS[(r.start_month||1)-1]}–${MONTHS[(r.end_month||12)-1]}): ${r.max_stalls} stalls`).join(' · ')} · All other months: {settings.total_spots} stalls
          </div>
        )}
      </div>

      {/* Reminder Emails */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h3 className="font-semibold text-slate-800">Parking Reminders</h3>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Days before check-in to auto-send reminder</label>
          <input type="number" min="0" max="60" value={settings.reminder_days_before || '3'} onChange={e => setSettings(s => ({ ...s, reminder_days_before: e.target.value }))} className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-slate-400 mt-1">Guests with an email will receive their parking portal link this many days before check-in. Set 0 to disable auto-reminders.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Parking instructions (included in reminder email)</label>
          <textarea rows={3} value={settings.parking_instructions || ''} onChange={e => setSettings(s => ({ ...s, parking_instructions: e.target.value }))} placeholder="e.g. Use the east entrance. Stall numbers are on the pillar. Contact reception at ext. 100 if you need help." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
        <Save className="w-4 h-4" />
        {saved ? 'Saved!' : saving ? 'Saving...' : 'Save All Settings'}
      </button>

      {/* Parking Spots (named) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h3 className="font-semibold text-slate-800">Named Parking Spots (optional)</h3>
        <p className="text-xs text-slate-400">Add individual stall IDs if you want to track by number. If empty, stalls are managed by the count above.</p>
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
