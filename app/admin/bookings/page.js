'use client';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Plus, Search, Copy, ExternalLink, CheckCircle, X, Car, Bell } from 'lucide-react';

const STATUS_COLORS = {
  confirmed: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-700',
};

const TYPE_COLORS = {
  guest: 'bg-blue-100 text-blue-700',
  owner: 'bg-amber-100 text-amber-700',
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [reminderSentId, setReminderSentId] = useState(null);
  const [sendingReminderId, setSendingReminderId] = useState(null);
  const [year] = useState(new Date().getFullYear());

  const BLANK = { unit_id: '', guest_name: '', guest_email: '', guest_phone: '', check_in: '', check_out: '', booking_type: 'guest', booking_ref: '', notes: '', status: 'confirmed' };
  const [form, setForm] = useState(BLANK);

  useEffect(() => {
    load();
    fetch('/api/units').then(r => r.json()).then(setUnits);
  }, []);

  const load = () => {
    setLoading(true);
    fetch(`/api/bookings?year=${year}`).then(r => r.json()).then(data => {
      setBookings(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  };

  const openCreate = () => { setForm(BLANK); setSelectedBooking(null); setShowModal(true); };
  const openEdit = (b) => {
    setForm({ unit_id: b.unit_id || '', guest_name: b.guest_name || '', guest_email: b.guest_email || '', guest_phone: b.guest_phone || '', check_in: b.check_in || '', check_out: b.check_out || '', booking_type: b.booking_type || 'guest', booking_ref: b.booking_ref || '', notes: b.notes || '', status: b.status || 'confirmed' });
    setSelectedBooking(b);
    setShowModal(true);
  };

  const save = async () => {
    setSaving(true);
    const method = selectedBooking ? 'PATCH' : 'POST';
    const url = selectedBooking ? `/api/bookings/${selectedBooking.id}` : '/api/bookings';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaving(false);
    setShowModal(false);
    load();
  };

  const deleteBooking = async (id) => {
    if (!confirm('Delete this booking?')) return;
    await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
    load();
  };

  const copyGuestLink = (b) => {
    const url = `${window.location.origin}/park/${b.parking_token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(b.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sendReminder = async (b) => {
    if (!b.guest_email) { alert('This booking has no guest email.'); return; }
    setSendingReminderId(b.id);
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: b.id }),
    }).then(r => r.json());
    setSendingReminderId(null);
    if (res.ok) { setReminderSentId(b.id); setTimeout(() => setReminderSentId(null), 3000); }
    else alert('Failed to send reminder: ' + (res.error || 'unknown error'));
  };

  const filtered = bookings.filter(b => {
    const q = search.toLowerCase().replace(/\s/g, '');
    const plates = (b.vehicle_registrations || []).map(v => v.plate?.replace(/\s/g, '').toLowerCase());
    const match = !q || [
      b.guest_name,
      b.guest_email,
      b.guest_phone,
      b.booking_ref,
      b.parking_units?.unit_number,
      ...plates,
    ].some(v => v?.toLowerCase().replace(/\s/g, '').includes(q));
    const typeMatch = filter === 'all' || b.booking_type === filter;
    return match && typeMatch;
  });

  // What field did the search match? (for hint display)
  const getMatchHint = (b) => {
    if (!search) return null;
    const q = search.toLowerCase().replace(/\s/g, '');
    if (b.guest_phone?.toLowerCase().includes(q)) return b.guest_phone;
    const plate = (b.vehicle_registrations || []).find(v => v.plate?.replace(/\s/g,'').toLowerCase().includes(q));
    if (plate) return `🚗 ${plate.plate}`;
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Bookings</h1>
          <p className="text-sm text-slate-500">{filtered.length} of {bookings.length} bookings shown</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> New Booking
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, ref, unit..." className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {['all', 'guest', 'owner'].map(t => (
          <button key={t} onClick={() => setFilter(t)} className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${filter === t ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <Car className="w-10 h-10 text-slate-200 mx-auto mb-2" />
            <p className="text-slate-500">No bookings found.</p>
            <button onClick={openCreate} className="mt-3 text-blue-600 text-sm hover:underline">Create a booking</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Guest / Owner</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Unit</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Dates</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-slate-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openEdit(b)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{b.guest_name || '—'}</div>
                      <div className="text-slate-400 text-xs">{b.guest_email}</div>
                      {b.booking_ref && <div className="text-slate-400 text-xs font-mono">{b.booking_ref}</div>}
                      {getMatchHint(b) && <div className="text-blue-500 text-xs font-medium mt-0.5">{getMatchHint(b)}</div>}
                    </td>
                    <td className="px-4 py-3 font-medium">{b.parking_units?.unit_number || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{b.check_in}</div>
                      <div className="text-slate-400 text-xs">→ {b.check_out}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[b.booking_type] || 'bg-slate-100 text-slate-600'}`}>
                        {b.booking_type || 'guest'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[b.status] || 'bg-slate-100 text-slate-600'}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        {b.parking_token && (
                          <>
                            <button onClick={() => copyGuestLink(b)} title="Copy guest parking link" className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
                              {copiedId === b.id ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                            <a href={`/park/${b.parking_token}`} target="_blank" title="Open guest portal" className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </>
                        )}
                        {b.guest_email && (
                          <button onClick={() => sendReminder(b)} title="Send parking reminder email" disabled={sendingReminderId === b.id} className={`p-1.5 rounded transition-colors ${reminderSentId === b.id ? 'text-emerald-500' : 'hover:bg-amber-50 text-amber-400 hover:text-amber-600'} disabled:opacity-40`}>
                            {reminderSentId === b.id ? <CheckCircle className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                          </button>
                        )}
                        <button onClick={() => deleteBooking(b.id)} className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-slate-900 mb-4">{selectedBooking ? 'Edit Booking' : 'New Booking'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                  <select value={form.booking_type} onChange={e => setForm(f => ({ ...f, booking_type: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="guest">Guest</option>
                    <option value="owner">Owner (permanent)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="confirmed">Confirmed</option>
                    <option value="pending">Pending</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Unit</label>
                <select value={form.unit_id} onChange={e => setForm(f => ({ ...f, unit_id: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">— Select unit —</option>
                  {units.map(u => <option key={u.id} value={u.id}>Unit {u.unit_number}{u.floor ? ` (Floor ${u.floor})` : ''}</option>)}
                </select>
              </div>
              {[['guest_name', 'Guest / Owner Name', 'text'], ['guest_email', 'Email', 'email'], ['guest_phone', 'Phone', 'tel'], ['booking_ref', 'Booking Reference (optional)', 'text']].map(([k, label, type]) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
                  <input type={type} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Check-in</label>
                  <input type="date" value={form.check_in} onChange={e => setForm(f => ({ ...f, check_in: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Check-out</label>
                  <input type="date" value={form.check_out} onChange={e => setForm(f => ({ ...f, check_out: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : selectedBooking ? 'Save Changes' : 'Create Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
