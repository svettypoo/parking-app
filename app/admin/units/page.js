'use client';
import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Building2 } from 'lucide-react';

export default function UnitsPage() {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const BLANK = { unit_number: '', floor: '', unit_type: 'standard', is_active: true, sort_order: 0 };
  const [form, setForm] = useState(BLANK);

  // Bulk add state
  const [bulkInput, setBulkInput] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/units').then(r => r.json()).then(data => { setUnits(Array.isArray(data) ? data : []); setLoading(false); });
  };
  useEffect(load, []);

  const openCreate = () => { setForm(BLANK); setEditing(null); setShowModal(true); };
  const openEdit = (u) => { setForm({ unit_number: u.unit_number, floor: u.floor || '', unit_type: u.unit_type || 'standard', is_active: u.is_active, sort_order: u.sort_order || 0 }); setEditing(u); setShowModal(true); };

  const save = async () => {
    setSaving(true);
    if (editing) {
      await fetch(`/api/units/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    } else {
      await fetch('/api/units', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    }
    setSaving(false);
    setShowModal(false);
    load();
  };

  const del = async (id) => {
    if (!confirm('Delete this unit? This may affect existing bookings.')) return;
    await fetch(`/api/units/${id}`, { method: 'DELETE' });
    load();
  };

  const bulkAdd = async () => {
    const lines = bulkInput.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setBulkSaving(true);
    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      const unit_number = parts[0];
      const floor = parts[1] || '';
      if (unit_number) {
        await fetch('/api/units', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unit_number, floor, unit_type: 'standard', is_active: true }) }).catch(() => {});
      }
    }
    setBulkSaving(false);
    setBulkInput('');
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Building Units</h1>
          <p className="text-sm text-slate-500">{units.length} units configured</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Add Unit
        </button>
      </div>

      {/* Bulk add */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-sm text-slate-700 mb-2">Bulk Add Units</h3>
        <p className="text-xs text-slate-400 mb-2">One unit per line. Format: <code className="bg-slate-100 px-1 rounded">unit_number, floor</code> (floor optional)</p>
        <textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)} rows={4} placeholder={"101, 1\n102, 1\n201, 2\n202, 2"} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
        <button onClick={bulkAdd} disabled={bulkSaving || !bulkInput.trim()} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 disabled:opacity-40">
          {bulkSaving ? 'Adding...' : 'Add All'}
        </button>
      </div>

      {/* Units grid */}
      {loading ? (
        <div className="text-center py-8 text-slate-400">Loading...</div>
      ) : units.length === 0 ? (
        <div className="text-center py-12">
          <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-2" />
          <p className="text-slate-400">No units yet. Add some above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {units.map(u => (
            <div key={u.id} className={`bg-white rounded-xl border ${u.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'} p-3 flex flex-col gap-2 hover:shadow-sm transition-shadow`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-slate-900">{u.unit_number}</div>
                  {u.floor && <div className="text-xs text-slate-400">Floor {u.floor}</div>}
                  <div className="text-xs text-slate-400 capitalize">{u.unit_type}</div>
                </div>
                {!u.is_active && <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full">Inactive</span>}
              </div>
              <div className="flex gap-1 mt-auto">
                <button onClick={() => openEdit(u)} className="flex-1 py-1 text-xs text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg flex items-center justify-center gap-1 transition-colors">
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
                <button onClick={() => del(u.id)} className="flex-1 py-1 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex items-center justify-center gap-1 transition-colors">
                  <Trash2 className="w-3 h-3" /> Del
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-slate-900 mb-4">{editing ? 'Edit Unit' : 'Add Unit'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Unit Number *</label>
                <input value={form.unit_number} onChange={e => setForm(f => ({ ...f, unit_number: e.target.value }))} placeholder="e.g. 101" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Floor</label>
                <input value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} placeholder="e.g. 1" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                <select value={form.unit_type} onChange={e => setForm(f => ({ ...f, unit_type: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="standard">Standard</option>
                  <option value="suite">Suite</option>
                  <option value="penthouse">Penthouse</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Sort Order</label>
                <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
                <span className="text-sm text-slate-700">Active</span>
              </label>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={save} disabled={saving || !form.unit_number} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Save' : 'Add Unit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
