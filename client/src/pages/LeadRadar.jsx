import { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || '';

// ── type colours ───────────────────────────────────────────────────────────
const TYPE_COLOURS = {
  school:    { bg: '#EEF2FF', border: '#818CF8', text: '#4338CA' },
  corporate: { bg: '#F0F9FF', border: '#38BDF8', text: '#0369A1' },
  clinic:    { bg: '#F0FDF4', border: '#4ADE80', text: '#166534' },
  ngo:       { bg: '#FFFBEB', border: '#FCD34D', text: '#92400E' },
  rehab:     { bg: '#FEF2F2', border: '#FCA5A5', text: '#991B1B' },
  coaching:  { bg: '#FAF5FF', border: '#C084FC', text: '#6B21A8' },
};
function typeStyle(t) { return TYPE_COLOURS[t] || { bg: '#F8FAFC', border: '#CBD5E1', text: '#475569' }; }

// ── helpers ────────────────────────────────────────────────────────────────
function getTargetRole(item) {
  if (item.target_role) return item.target_role;
  const map = {
    school:    'Principal / Vice Principal',
    corporate: 'HR Manager / L&D Head',
    clinic:    'Clinic Director',
    ngo:       'Programme Director',
    rehab:     'Centre Head',
    coaching:  'Director / Owner',
  };
  return map[item.type] || 'Decision Maker';
}

function shortUrl(url) {
  if (!url) return null;
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url.slice(0, 30); }
}

function scoreColour(score) {
  if (score >= 80) return '#10B981';
  if (score >= 60) return '#F59E0B';
  return '#EF4444';
}

// ─────────────────────────────────────────────────────────────────────────
export default function LeadRadar() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast]       = useState(null);
  const [filter, setFilter]     = useState('all');
  const [approving, setApproving] = useState({});
  const [contractModal, setContractModal] = useState(null); // { item, value }

  // ── fetch queue ──────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/radar?status=pending&limit=50`);
      const data = await r.json();
      setItems(data.items || []);
    } catch (e) {
      showToast('Failed to load radar queue', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  // ── toast ────────────────────────────────────────────────────────────────
  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  // ── trigger scan ─────────────────────────────────────────────────────────
  async function handleScan() {
    setScanning(true);
    showToast('Scanning job platforms… new leads will appear in 1-2 minutes', 'info');
    try {
      const r = await fetch(`${API}/api/radar/trigger`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Scan failed');
      // Refresh after a short delay to catch new leads
      setTimeout(fetchQueue, 8000);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setScanning(false);
    }
  }

  // ── approve ──────────────────────────────────────────────────────────────
  function openApprove(item) {
    setContractModal({ item, value: item.contract_value || '' });
  }

  async function confirmApprove() {
    const { item, value } = contractModal;
    setContractModal(null);
    setApproving(a => ({ ...a, [item._id]: true }));
    try {
      const r = await fetch(`${API}/api/radar/approve/${item._id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ contract_value: Number(value) || 0 }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Approve failed');
      showToast(`✅ ${item.org_name} added to pipeline!`);
      setItems(prev => prev.filter(i => i._id !== item._id));
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setApproving(a => ({ ...a, [item._id]: false }));
    }
  }

  // ── reject ───────────────────────────────────────────────────────────────
  async function handleReject(item) {
    try {
      await fetch(`${API}/api/radar/reject/${item._id}`, { method: 'POST' });
      setItems(prev => prev.filter(i => i._id !== item._id));
    } catch (e) {
      showToast('Reject failed', 'error');
    }
  }

  // ── filter ───────────────────────────────────────────────────────────────
  const TYPES = ['all', 'school', 'corporate', 'clinic', 'ngo', 'rehab', 'coaching'];
  const displayed = filter === 'all' ? items : items.filter(i => i.type === filter);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: '#1E293B' }}>
            📡 Lead Radar
          </h1>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 14 }}>
            Organisations hiring counsellors / wellness roles — hot signals for Cittaa
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#64748B' }}>{displayed.length} lead{displayed.length !== 1 ? 's' : ''}</span>
          <button
            onClick={fetchQueue}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 13 }}
          >
            ↻ Refresh
          </button>
          <button
            onClick={handleScan}
            disabled={scanning}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: scanning ? '#94A3B8' : 'linear-gradient(135deg,#4F46E5,#7C3AED)',
              color: '#fff', fontWeight: 600, fontSize: 14, cursor: scanning ? 'not-allowed' : 'pointer',
              boxShadow: scanning ? 'none' : '0 4px 14px rgba(79,70,229,0.35)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {scanning ? '⏳ Scanning…' : '🔍 Scan Job Platforms'}
          </button>
        </div>
      </div>

      {/* ── type filter tabs ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {TYPES.map(t => {
          const active = filter === t;
          const s = t !== 'all' ? typeStyle(t) : null;
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              style={{
                padding: '6px 14px', borderRadius: 20, border: `1px solid ${active ? (s?.border || '#4F46E5') : '#E2E8F0'}`,
                background: active ? (s?.bg || '#EEF2FF') : '#fff',
                color: active ? (s?.text || '#4338CA') : '#64748B',
                fontWeight: active ? 600 : 400,
                fontSize: 13, cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* ── loading ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚙️</div>
          <p>Loading radar queue…</p>
        </div>
      )}

      {/* ── empty ── */}
      {!loading && displayed.length === 0 && (
        <div style={{ textAlign: 'center', padding: 80, background: '#F8FAFC', borderRadius: 16, border: '1px dashed #E2E8F0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📡</div>
          <h3 style={{ margin: 0, color: '#1E293B' }}>No leads in queue</h3>
          <p style={{ color: '#64748B', marginTop: 8 }}>Click "Scan Job Platforms" to discover organisations hiring counsellors / wellness staff.</p>
        </div>
      )}

      {/* ── lead cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 20 }}>
        {displayed.map(item => {
          const ts = typeStyle(item.type);
          const score = item.ai_score || 50;
          const targetRole = getTargetRole(item);
          const domain = shortUrl(item.source_url);

          return (
            <div
              key={item._id}
              style={{
                background: '#fff', borderRadius: 16,
                border: `1.5px solid ${ts.border}`,
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                overflow: 'hidden',
                opacity: approving[item._id] ? 0.6 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              {/* card header */}
              <div style={{ background: ts.bg, padding: '16px 18px', borderBottom: `1px solid ${ts.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: ts.text,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      {item.type || 'lead'}
                    </span>
                    <h3 style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700, color: '#1E293B', lineHeight: 1.3 }}>
                      {item.org_name}
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>
                      📍 {[item.city, item.state].filter(Boolean).join(', ') || 'India'}
                    </p>
                  </div>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: scoreColour(score) + '20',
                    border: `2px solid ${scoreColour(score)}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginLeft: 10,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: scoreColour(score) }}>{score}</span>
                  </div>
                </div>
              </div>

              {/* card body */}
              <div style={{ padding: '14px 18px' }}>

                {/* Job posting signal */}
                {(item.job_title_hiring_for || item.discovery_source) && (
                  <div style={{
                    background: '#F0FDF4', border: '1px solid #BBF7D0',
                    borderRadius: 10, padding: '10px 14px', marginBottom: 12,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', marginBottom: 6, textTransform: 'uppercase' }}>
                      📋 Job Posting Signal
                    </div>
                    {item.job_title_hiring_for && (
                      <div style={{ fontSize: 13, color: '#15803D', fontWeight: 600 }}>
                        Hiring: "{item.job_title_hiring_for}"
                      </div>
                    )}
                    {item.discovery_source && (
                      <div style={{ fontSize: 12, color: '#4ADE80', marginTop: 2 }}>
                        Source: {item.discovery_source}
                      </div>
                    )}
                    {domain && (
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12, color: '#166534', display: 'inline-block', marginTop: 4 }}
                      >
                        🔗 View job post → {domain}
                      </a>
                    )}
                  </div>
                )}

                {/* Target role */}
                <div style={{
                  background: '#F5F3FF', border: '1px solid #DDD6FE',
                  borderRadius: 10, padding: '8px 14px', marginBottom: 12,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase' }}>🎯 Role to Approach</span>
                  <div style={{ fontSize: 13, color: '#7C3AED', fontWeight: 600, marginTop: 2 }}>{targetRole}</div>
                </div>

                {/* Contact info */}
                {item.contact_name && (
                  <div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600 }}>👤 {item.contact_name}</span>
                    {item.role && <span style={{ color: '#94A3B8' }}> · {item.role}</span>}
                  </div>
                )}
                {item.email && (
                  <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>📧 {item.email}</div>
                )}
                {item.phone && (
                  <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>📞 {item.phone}</div>
                )}
                {item.employees_or_students > 0 && (
                  <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>
                    👥 {item.employees_or_students.toLocaleString()} employees/students
                  </div>
                )}

                {/* Notes */}
                {item.notes && (
                  <p style={{
                    margin: '10px 0 0', fontSize: 12, color: '#64748B',
                    lineHeight: 1.5, borderTop: '1px solid #F1F5F9', paddingTop: 10,
                  }}>
                    {item.notes}
                  </p>
                )}
              </div>

              {/* card actions */}
              <div style={{ padding: '12px 18px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 10 }}>
                <button
                  onClick={() => handleReject(item)}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 9,
                    border: '1px solid #E2E8F0', background: '#fff',
                    color: '#EF4444', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  ✕ Skip
                </button>
                <button
                  onClick={() => openApprove(item)}
                  disabled={!!approving[item._id]}
                  style={{
                    flex: 2, padding: '9px 0', borderRadius: 9, border: 'none',
                    background: approving[item._id]
                      ? '#94A3B8'
                      : 'linear-gradient(135deg,#10B981,#059669)',
                    color: '#fff', fontWeight: 700, fontSize: 13,
                    cursor: approving[item._id] ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
                  }}
                >
                  {approving[item._id] ? 'Adding…' : '✓ Add to Pipeline'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Contract value modal ── */}
      {contractModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 32,
            width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, color: '#1E293B' }}>
              Add to Pipeline
            </h3>
            <p style={{ margin: '0 0 20px', color: '#64748B', fontSize: 14 }}>
              {contractModal.item.org_name}
            </p>

            <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
              Estimated Contract Value (₹)
            </label>
            <input
              type="number"
              placeholder="e.g. 250000"
              value={contractModal.value}
              onChange={e => setContractModal(m => ({ ...m, value: e.target.value }))}
              style={{
                width: '100%', marginTop: 8, padding: '10px 14px',
                border: '1.5px solid #E2E8F0', borderRadius: 9,
                fontSize: 15, outline: 'none', boxSizing: 'border-box',
              }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') confirmApprove(); if (e.key === 'Escape') setContractModal(null); }}
            />

            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button
                onClick={() => setContractModal(null)}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 9,
                  border: '1px solid #E2E8F0', background: '#fff',
                  color: '#64748B', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmApprove}
                style={{
                  flex: 2, padding: '11px 0', borderRadius: 9, border: 'none',
                  background: 'linear-gradient(135deg,#10B981,#059669)',
                  color: '#fff', fontWeight: 700, cursor: 'pointer',
                }}
              >
                ✓ Confirm & Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          padding: '14px 22px', borderRadius: 12,
          background: toast.type === 'error' ? '#FEF2F2'
                    : toast.type === 'info'  ? '#EFF6FF' : '#F0FDF4',
          border: `1px solid ${toast.type === 'error' ? '#FCA5A5' : toast.type === 'info' ? '#BAE6FD' : '#BBF7D0'}`,
          color: toast.type === 'error' ? '#991B1B' : toast.type === 'info' ? '#1E40AF' : '#166534',
          fontWeight: 500, fontSize: 14, zIndex: 9999,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          maxWidth: 380,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
