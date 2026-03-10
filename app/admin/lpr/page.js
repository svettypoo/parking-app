'use client';
import { useState, useEffect, useRef } from 'react';
import { Camera, AlertTriangle, CheckCircle, Clock, RefreshCw, Send } from 'lucide-react';

const tabs = ['Live Feed', 'Violations'];

export default function LPRPage() {
  const [tab, setTab] = useState('Live Feed');
  const [detections, setDetections] = useState([]);
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [violationFilter, setViolationFilter] = useState('open');
  const intervalRef = useRef(null);

  // Manual test feed
  const [testPlate, setTestPlate] = useState('');
  const [testMake, setTestMake] = useState('');
  const [testModel, setTestModel] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [sending, setSending] = useState(false);

  const loadFeed = async () => {
    const res = await fetch('/api/lpr?limit=50').then(r => r.json());
    setDetections(Array.isArray(res) ? res : []);
  };

  const loadViolations = async () => {
    const res = await fetch(`/api/violations?status=${violationFilter}`).then(r => r.json());
    setViolations(Array.isArray(res) ? res : []);
  };

  useEffect(() => {
    loadFeed();
    loadViolations();
  }, [violationFilter]);

  useEffect(() => {
    if (autoRefresh && tab === 'Live Feed') {
      intervalRef.current = setInterval(loadFeed, 5000);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, tab]);

  const sendTestDetection = async () => {
    if (!testPlate) return;
    setSending(true);
    const res = await fetch('/api/lpr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plate: testPlate, make: testMake, model: testModel, camera_id: 'test' }),
    }).then(r => r.json());
    setTestResult(res);
    setSending(false);
    loadFeed();
    loadViolations();
  };

  const resolveViolation = async (id) => {
    await fetch('/api/violations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'resolved' }),
    });
    loadViolations();
  };

  const fmtTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString('en-CA');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">LPR & Enforcement</h1>
          <p className="text-sm text-slate-500">License plate recognition feed and violation tickets</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="rounded" />
            Auto-refresh (5s)
          </label>
          <button onClick={() => { loadFeed(); loadViolations(); }} className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* API Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <h3 className="font-semibold text-sm text-blue-900 mb-2">LPR Camera Integration</h3>
        <p className="text-xs text-blue-700 mb-2">Point your LPR camera/system to POST detections to this endpoint:</p>
        <div className="bg-white rounded-lg p-3 font-mono text-xs text-slate-700 border border-blue-100 mb-2">
          POST {typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}/api/lpr
          <br />
          {'{'} "plate": "ABC123", "make": "Toyota", "model": "Camry", "color": "white", "confidence": 98.5, "camera_id": "entrance" {'}'}
        </div>
        <p className="text-xs text-blue-600">The system will automatically compare the plate to registered vehicles and create violations for unauthorized plates.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t}
            {t === 'Violations' && violations.filter(v => v.status === 'open').length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {violations.filter(v => v.status === 'open').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'Live Feed' && (
        <div className="space-y-4">
          {/* Test Input */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-sm text-slate-700 mb-3 flex items-center gap-2"><Camera className="w-4 h-4" /> Simulate Detection (for testing)</h3>
            <div className="flex gap-2 flex-wrap">
              <input value={testPlate} onChange={e => setTestPlate(e.target.value.toUpperCase())} placeholder="Plate (e.g. ABC123)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono w-36 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase" />
              <input value={testMake} onChange={e => setTestMake(e.target.value)} placeholder="Make" className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={testModel} onChange={e => setTestModel(e.target.value)} placeholder="Model" className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={sendTestDetection} disabled={sending || !testPlate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
                <Send className="w-3.5 h-3.5" /> {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
            {testResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${testResult.is_authorized ? 'bg-emerald-50 border border-emerald-100 text-emerald-700' : 'bg-red-50 border border-red-100 text-red-700'}`}>
                {testResult.is_authorized ? '✓ Authorized — plate found in registry' : `✗ Unauthorized — violation ticket created (#${testResult.violation?.id?.slice(0, 8) || '?'})`}
              </div>
            )}
          </div>

          {/* Feed */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-slate-700">Recent Detections</h3>
              <span className="text-xs text-slate-400">{detections.length} records</span>
            </div>
            {detections.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Camera className="w-10 h-10 mx-auto mb-2 text-slate-200" />
                No detections yet. Connect your LPR camera or use the test tool above.
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {detections.map(d => (
                  <div key={d.id} className="px-4 py-3 flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${d.is_authorized ? 'bg-emerald-400' : 'bg-red-500'}`} />
                    <div className="font-mono font-bold text-slate-900 w-24">{d.plate}</div>
                    <div className="text-sm text-slate-500 flex-1">
                      {[d.detected_make, d.detected_model].filter(Boolean).join(' ') || '—'}
                    </div>
                    <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.is_authorized ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {d.is_authorized ? 'Authorized' : 'VIOLATION'}
                    </div>
                    <div className="text-xs text-slate-400 w-36 text-right">{fmtTime(d.detected_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Violations' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {['open', 'resolved', 'all'].map(f => (
              <button key={f} onClick={() => setViolationFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${violationFilter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {violations.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-200" />
                No {violationFilter === 'all' ? '' : violationFilter} violations.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {violations.map(v => (
                  <div key={v.id} className="px-4 py-4 flex items-start gap-4">
                    <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${v.status === 'open' ? 'bg-red-100' : 'bg-slate-100'}`}>
                      {v.status === 'open' ? <AlertTriangle className="w-4 h-4 text-red-500" /> : <CheckCircle className="w-4 h-4 text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-slate-900">{v.plate}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v.status === 'open' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                          {v.status}
                        </span>
                      </div>
                      {(v.detected_make || v.detected_model) && (
                        <div className="text-sm text-slate-500">{[v.detected_make, v.detected_model].filter(Boolean).join(' ')}</div>
                      )}
                      <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                        <Clock className="w-3 h-3" /> {fmtTime(v.violation_at)}
                        {v.camera_id && <span>· Camera: {v.camera_id}</span>}
                      </div>
                      {v.notes && <div className="text-xs text-slate-500 mt-1 italic">{v.notes}</div>}
                    </div>
                    {v.status === 'open' && (
                      <button onClick={() => resolveViolation(v.id)} className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                        Resolve
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
