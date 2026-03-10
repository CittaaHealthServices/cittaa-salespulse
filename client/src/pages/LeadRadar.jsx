import { useEffect, useState } from 'react';
import { getRadarQueue, approveQueueItem, rejectQueueItem, getDiscoveryLogs, getRadarStats, triggerDiscovery } from '../utils/api';
import { formatCurrency, formatRelative, scoreClass } from '../utils/helpers';
import toast from 'react-hot-toast';
import { Radar, Play, Check, X, Clock, RefreshCw } from 'lucide-react';

const REVIEWER = 'S';

// ─── Target role fallback ─────────────────────────────────────────────────────
function getTargetRole(item) {
  if (item.target_role) return item.target_role;
  if (item.role) return item.role;
  const defaults = {
    school:    'Principal / Vice Principal / Counselling Coordinator',
    coaching:  'Centre Director / Academic Head',
    corporate: 'HR Head / CHRO / Wellness Manager',
    clinic:    'Founder / Lead Psychologist / Director',
    ngo:       'Programme Director / CEO',
    rehab:     'Centre Director / Head Therapist',
  };
  return defaults[item.type] || 'Decision Maker';
}

// ─── Shorten URL for display ──────────────────────────────────────────────────
function shortUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.hostname.replace('www.', '');
  } catch { return url.slice(0, 40); }
}

// ─── Type badge colour ────────────────────────────────────────────────────────
const TYPE_EMOJI = { school:'🏫', coaching:'📚', corporate:'🏢', clinic:'🧠', ngo:'🤝', rehab:'♿' };

export default function LeadRadar() {
  const [queue, setQueue]         = useState([]);
  const [logs, setLogs]           = useState([]);
  const [stats, setStats]         = useState({});
  const [tab, setTab]             = useState('pending');
  const [loading, setLoading]     = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [total, setTotal]         = useState(0);

  const load = async () => {
    try {
      setLoading(true);
      const [qRes, logsRes, statsRes] = await Promise.all([
        getRadarQueue({ status: tab }),
        getDiscoveryLogs(),
        getRadarStats(),
      ]);
      setQueue(qRes.items || []);
      setTotal(qRes.total || 0);
      setLogs(logsRes || []);
      setStats(statsRes || {});
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [tab]);

  const handleApprove = async (id) => {
    try {
      await approveQueueItem(id, REVIEWER);
      toast.success('Lead approved & moved to Lead Hub!');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const handleReject = async (id) => {
    try {
      await rejectQueueItem(id, REVIEWER);
      toast.success('Lead rejected');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await triggerDiscovery();
      toast.success('Discovery started! New leads will appear in a few minutes.');
    } catch (e) { toast.error(e.message); }
    finally { setTimeout(() => setTriggering(false), 3000); }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 0 60px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Radar size={28} color="var(--purple)" />
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Lead Radar</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>AI-discovered leads • South India + All India</p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleTrigger} disabled={triggering}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {triggering ? <RefreshCw size={16} className="spin" /> : <Play size={16} />}
          {triggering ? 'Scanning...' : 'Run Scan Now'}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Pending Review', value: stats.pending ?? '—', color: '#f59e0b' },
          { label: 'Approved', value: stats.approved ?? '—', color: '#16a34a' },
          { label: 'Rejected', value: stats.rejected ?? '—', color: '#dc2626' },
        ].map(s => (
          <div key={s.label} className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['pending', 'approved', 'rejected'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={tab === t ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ textTransform: 'capitalize', fontSize: '0.85rem' }}>
            {t}
          </button>
        ))}
      </div>

      {/* Queue */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : queue.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <Radar size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p>{tab === 'pending' ? 'No pending leads. Click "Run Scan Now" to discover new leads.' : `No ${tab} leads yet.`}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {queue.map(item => <RadarCard key={item._id} item={item} showActions={tab === 'pending'} onApprove={handleApprove} onReject={handleReject} />)}
        </div>
      )}
    </div>
  );
}

// ─── Radar Card ───────────────────────────────────────────────────────────────
function RadarCard({ item, showActions, onApprove, onReject }) {
  const emoji = TYPE_EMOJI[item.type] || '🏢';
  const targetRole = getTargetRole(item);
  const sourceHost = shortUrl(item.source_url);

  return (
    <div className="card" style={{ position: 'relative', padding: '18px 20px' }}>
      {/* Score badge */}
      <div style={{
        position: 'absolute', top: 14, right: 16,
        background: item.ai_score >= 70 ? '#22c55e' : item.ai_score >= 45 ? '#f59e0b' : '#ef4444',
        color: '#fff', borderRadius: 20, padding: '3px 10px',
        fontSize: '0.78rem', fontWeight: 700,
      }}>
        {item.ai_score}/100
      </div>

      {/* Org name + type */}
      <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 2, paddingRight: 60, color: 'var(--ink)' }}>
        {emoji} {item.org_name}
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 10 }}>
        <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{item.type}</span>
        {item.city && <span> · 📍 {item.city}{item.state ? `, ${item.state}` : ''}</span>}
        {item.employees_or_students && (
          <span> · 👥 {item.employees_or_students.toLocaleString('en-IN')} {item.type === 'school' ? 'students' : 'employees'}</span>
        )}
      </div>

      {/* ── TARGET ROLE ── always shown */}
      <div style={{
        background: '#f4f0fd', borderLeft: '3px solid var(--purple)',
        borderRadius: '0 6px 6px 0', padding: '8px 12px', marginBottom: 8,
      }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--purple)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          🎯 Role to Approach
        </div>
        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--ink)', marginTop: 2 }}>
          {targetRole}
        </div>
        {item.contact_name && (
          <div style={{ fontSize: '0.78rem', color: '#555', marginTop: 3 }}>
            👤 Found: {item.contact_name}{item.role && item.role !== item.target_role ? ` · ${item.role}` : ''}
          </div>
        )}
        {item.email && <div style={{ fontSize: '0.78rem', color: '#555', marginTop: 1 }}>📧 {item.email}</div>}
        {item.phone && <div style={{ fontSize: '0.78rem', color: '#555', marginTop: 1 }}>📞 {item.phone}</div>}
      </div>

      {/* ── SOURCE WEBSITE ── */}
      {(item.source_url || item.discovery_query) && (
        <div style={{
          background: '#f0faf7', borderLeft: '3px solid var(--teal, #0d9488)',
          borderRadius: '0 6px 6px 0', padding: '7px 12px', marginBottom: 8,
        }}>
          {item.source_url && (
            <div style={{ fontSize: '0.75rem', marginBottom: item.discovery_query ? 3 : 0 }}>
              <span style={{ color: 'var(--teal, #0d9488)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.5px' }}>
                🌐 Found on
              </span>
              {' '}
              <a href={item.source_url} target="_blank" rel="noreferrer"
                style={{ color: 'var(--teal, #0d9488)', fontWeight: 600, textDecoration: 'underline' }}>
                {sourceHost}
              </a>
            </div>
          )}
          {item.discovery_query && (
            <div style={{ fontSize: '0.72rem', color: '#555' }}>
              <span style={{ color: 'var(--teal, #0d9488)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.5px' }}>
                🔍 Search used
              </span>
              {' '}
              <span style={{ fontStyle: 'italic', color: '#666' }}>
                "{item.discovery_query.slice(0, 80)}{item.discovery_query.length > 80 ? '…' : ''}"
              </span>
            </div>
          )}
        </div>
      )}

      {/* Why a lead */}
      {item.why_good_lead && (
        <div style={{
          background: 'var(--mist)', borderRadius: 6, padding: '8px 11px',
          fontSize: '0.79rem', color: 'var(--ink)', marginBottom: 10, lineHeight: 1.5,
        }}>
          ✨ {item.why_good_lead}
        </div>
      )}

      {/* AI Reasoning */}
      {item.ai_reasoning && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10, fontStyle: 'italic' }}>
          AI: {item.ai_reasoning}
        </div>
      )}

      {/* Est. value */}
      {item.estimated_value > 0 && (
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--purple)', marginBottom: 10 }}>
          💰 Est. {formatCurrency(item.estimated_value)} / year
        </div>
      )}

      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: showActions ? 14 : 0 }}>
        Discovered {formatRelative(item.discovered_at)}
        {item.status !== 'pending' && ` · ${item.status} by ${item.reviewed_by}`}
      </div>

      {showActions && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-success" style={{ flex: 1 }} onClick={() => onApprove(item._id)}>
            <Check size={15} /> Approve → Lead Hub
          </button>
          <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => onReject(item._id)}>
            <X size={15} /> Reject
          </button>
        </div>
      )}
    </div>
  );
}
