'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { format, eachDayOfInterval, startOfYear, endOfYear, parseISO, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Car } from 'lucide-react';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function OccupancyGrid() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [units, setUnits] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [availability, setAvailability] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [jumpMonth, setJumpMonth] = useState(new Date().getMonth());
  const monthRefs = useRef({});
  const today = format(new Date(), 'yyyy-MM-dd');

  const days = useMemo(() =>
    eachDayOfInterval({ start: startOfYear(new Date(year, 0, 1)), end: endOfYear(new Date(year, 0, 1)) }),
    [year]
  );

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/units').then(r => r.json()),
      fetch(`/api/bookings?year=${year}`).then(r => r.json()),
      fetch(`/api/availability?year=${year}`).then(r => r.json()),
    ]).then(([u, b, a]) => {
      setUnits(Array.isArray(u) ? u : []);
      setBookings(Array.isArray(b) ? b : []);
      setAvailability(a && typeof a === 'object' ? a : {});
      setLoading(false);
    });
  }, [year]);

  // Build lookup: unitId -> list of bookings sorted by check_in
  const bookingsByUnit = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      if (!b.unit_id) continue;
      if (!map[b.unit_id]) map[b.unit_id] = [];
      map[b.unit_id].push(b);
    }
    return map;
  }, [bookings]);

  // Get booking for unit on a specific date
  const getBookingForDate = (unitId, dateStr) => {
    const list = bookingsByUnit[unitId] || [];
    return list.find(b => b.check_in <= dateStr && b.check_out >= dateStr) || null;
  };

  const isBookingStart = (booking, dateStr) => booking && booking.check_in === dateStr;

  const getSpan = (booking, dateStr, dayIndex) => {
    if (!booking) return 1;
    const endStr = booking.check_out;
    let endIdx = days.findIndex(d => format(d, 'yyyy-MM-dd') === endStr);
    if (endIdx === -1) endIdx = days.length - 1;
    return Math.max(1, endIdx - dayIndex + 1);
  };

  const scrollToMonth = (m) => {
    const el = monthRefs.current[m];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const bookingColor = (b) => {
    if (!b) return '';
    if (b.booking_type === 'owner') return 'bg-amber-500 border-amber-400';
    return 'bg-blue-500 border-blue-400';
  };

  const availColor = (avail) => {
    if (!avail) return 'text-slate-400';
    const ratio = avail.available / avail.total;
    if (ratio === 0) return 'text-red-600 font-bold';
    if (ratio < 0.3) return 'text-orange-500 font-semibold';
    if (ratio < 0.6) return 'text-yellow-600';
    return 'text-emerald-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Car className="w-6 h-6 animate-pulse text-blue-500" />
        <span className="text-slate-500">Loading occupancy data...</span>
      </div>
    );
  }

  if (units.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Building className="w-12 h-12 text-slate-300" />
        <p className="text-slate-500 text-lg">No units configured yet.</p>
        <a href="/admin/units" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Add Units</a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Occupancy Grid</h1>
          <p className="text-sm text-slate-500">{units.length} units · {bookings.length} bookings in {year}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Month jump */}
          <select
            value={jumpMonth}
            onChange={e => { const m = parseInt(e.target.value); setJumpMonth(m); scrollToMonth(m); }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
          >
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          {/* Year nav */}
          <button onClick={() => setYear(y => y - 1)} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 bg-white">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-bold text-slate-900 px-2">{year}</span>
          <button onClick={() => setYear(y => y + 1)} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 bg-white">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-500" /> Guest booking</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-500" /> Owner</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-white border border-slate-200" /> Available</div>
        <div className="flex items-center gap-4 ml-auto">
          <span className="text-emerald-600">■ Plenty</span>
          <span className="text-yellow-600">■ Limited</span>
          <span className="text-red-600 font-bold">■ Full</span>
          <span className="text-slate-400">= parking spots</span>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-auto rounded-xl border border-slate-200 shadow-sm bg-white" style={{ maxHeight: 'calc(100vh - 220px)' }}>
        <table className="grid-table text-xs" style={{ minWidth: `${200 + units.length * 100}px` }}>
          <thead className="sticky top-0 z-20 bg-white shadow-sm">
            <tr>
              {/* Date column header */}
              <th className="sticky left-0 z-30 bg-white px-3 py-2 text-left text-slate-600 font-semibold border-r border-b border-slate-200 min-w-[120px] whitespace-nowrap">
                Date
              </th>
              {/* Parking counter column */}
              <th className="sticky bg-white px-2 py-2 text-center text-slate-600 font-semibold border-r border-b border-slate-200 min-w-[60px] whitespace-nowrap" style={{ left: '120px', zIndex: 30 }}>
                <span title="Available parking spots">🅿️</span>
              </th>
              {/* Unit columns */}
              {units.map(u => (
                <th key={u.id} className="px-2 py-2 text-center font-semibold text-slate-700 border-b border-slate-200 min-w-[90px] whitespace-nowrap">
                  <a href="/admin/units" className="hover:text-blue-600">{u.unit_number}</a>
                  {u.floor && <div className="text-[10px] text-slate-400 font-normal">Floor {u.floor}</div>}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {days.map((day, dayIdx) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const avail = availability[dateStr];
              const isToday = dateStr === today;
              const isFirstOfMonth = day.getDate() === 1;

              return (
                <>
                  {/* Month separator row */}
                  {isFirstOfMonth && (
                    <tr key={`month-${dayIdx}`} ref={el => monthRefs.current[day.getMonth()] = el}>
                      <td colSpan={units.length + 2}
                        className="sticky left-0 bg-slate-700 text-white text-xs font-bold py-1 px-3">
                        {format(day, 'MMMM yyyy')}
                      </td>
                    </tr>
                  )}
                  <tr key={dateStr} className={`${isToday ? 'bg-blue-50' : 'hover:bg-slate-50'} transition-colors`}>
                    {/* Date cell */}
                    <td className={`sticky left-0 z-10 px-3 py-1.5 border-r border-slate-200 whitespace-nowrap font-medium ${isToday ? 'bg-blue-100 text-blue-700' : 'bg-white text-slate-700'}`}>
                      <span className="text-slate-400 mr-1 text-[10px]">{format(day, 'EEE')}</span>
                      {format(day, 'MMM d')}
                      {isToday && <span className="ml-1 text-[10px] bg-blue-500 text-white rounded px-1">Today</span>}
                    </td>

                    {/* Parking counter */}
                    <td className={`sticky z-10 px-2 py-1.5 text-center border-r border-slate-200 ${isToday ? 'bg-blue-50' : 'bg-white'}`} style={{ left: '120px' }}>
                      {avail ? (
                        <span className={`text-xs font-bold ${availColor(avail)}`} title={`${avail.available} of ${avail.total} spots available`}>
                          {avail.available}/{avail.total}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>

                    {/* Unit cells */}
                    {units.map(u => {
                      const booking = getBookingForDate(u.id, dateStr);
                      const isStart = isBookingStart(booking, dateStr);
                      const isContinuation = booking && !isStart;

                      if (isContinuation) return null; // handled by colspan

                      if (booking && isStart) {
                        const span = getSpan(booking, dateStr, dayIdx);
                        return (
                          <td key={u.id} rowSpan={Math.min(span, days.length - dayIdx)}
                            className="px-1 py-0.5 align-top cursor-pointer"
                            onClick={() => setSelectedBooking(booking)}>
                            <div className={`rounded px-1.5 py-1 text-white text-[10px] border ${bookingColor(booking)} hover:opacity-90 transition-opacity`}>
                              <div className="font-bold truncate">{booking.guest_name || booking.guest_email || '—'}</div>
                              {booking.booking_type === 'owner' && <div className="text-amber-100 text-[9px]">Owner</div>}
                              <div className="text-blue-100 text-[9px]">{booking.check_in} → {booking.check_out}</div>
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td key={u.id} className="border-slate-100">
                          <div className="h-8" />
                        </td>
                      );
                    })}
                  </tr>
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Booking detail popup */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelectedBooking(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-slate-900 mb-1">{selectedBooking.guest_name || 'Guest'}</h3>
            <p className="text-sm text-slate-500 mb-3">{selectedBooking.guest_email}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Unit</span><span className="font-medium">{selectedBooking.parking_units?.unit_number || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Check-in</span><span className="font-medium">{selectedBooking.check_in}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Check-out</span><span className="font-medium">{selectedBooking.check_out}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Type</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${selectedBooking.booking_type === 'owner' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                  {selectedBooking.booking_type || 'guest'}
                </span>
              </div>
              {selectedBooking.booking_ref && <div className="flex justify-between"><span className="text-slate-500">Ref</span><span className="font-mono text-xs">{selectedBooking.booking_ref}</span></div>}
              {selectedBooking.parking_token && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-slate-500 text-xs mb-1">Guest parking link:</p>
                  <div className="flex gap-2">
                    <input readOnly className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 font-mono" value={`${typeof window !== 'undefined' ? window.location.origin : ''}/park/${selectedBooking.parking_token}`} />
                    <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/park/${selectedBooking.parking_token}`)} className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">Copy</button>
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setSelectedBooking(null)} className="mt-4 w-full py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
