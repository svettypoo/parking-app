'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, CalendarDays, Car, Camera, Settings, Building2, Menu, X } from 'lucide-react';
import { useState } from 'react';

const NAV = [
  { href: '/admin/grid', label: 'Occupancy Grid', icon: LayoutGrid },
  { href: '/admin/bookings', label: 'Bookings', icon: CalendarDays },
  { href: '/admin/units', label: 'Units', icon: Building2 },
  { href: '/admin/lpr', label: 'LPR / Enforcement', icon: Camera },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminShell({ children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {open && <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-slate-900 text-white z-50 flex flex-col transform transition-transform duration-200 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-5 border-b border-slate-700 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center">
            <Car className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-sm">ParkManager</div>
            <div className="text-xs text-slate-400">Resort Portal</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link key={href} href={href} onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-700 text-xs text-slate-500">Resort Parking System v1.0</div>
      </aside>

      {/* Main */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Mobile header */}
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
          <button onClick={() => setOpen(!open)} className="p-1">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="font-semibold text-slate-900">ParkManager</span>
        </div>
        <main className="flex-1 p-4 lg:p-6 max-w-none">
          {children}
        </main>
      </div>
    </div>
  );
}
