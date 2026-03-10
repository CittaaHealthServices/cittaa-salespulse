import { useEffect, useState } from 'react';
import { getRadarQueue, approveQueueItem, rejectQueueItem, getDiscoveryLogs, getRadarStats, triggerDiscovery } from '../utils/api';
import { formatCurrency, formatRelative, scoreClass } from '../utils/helpers';
import toast from 'react-hot-toast';
import { Radar, Play, Check, X, RefreshCw } from 'lucide-react';

const REVIEWER = 'S';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTargetRole(item) {
  if (item.target_role) return item.target_role;
  if (item.role) return item.role;
  const d = {
    school: 'Principal / Vice Principal / Counselling Coordinator',
    coaching: 'Centre Director / Academic Head',
    corporate: 'HR Head / CHRO / Wellness Manager',
    clinic: 'Founder / Lead Psychologist / Director',
    ngo: 'Programme Director / CEO',
    rehab: 'Centre Director / Head Therapist',
  };
  return d[item.type] || 'Decision Maker';
}

function shortUrl(url) {
  if (!url) return null;
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url.slice(0, 35); }
}

const TYPE_EMOJI = { school: '🏫', coaching: '📚', corporate: '🏢', clinic: '🧠', ngo: '🤝', rehab: '♿' };

export default function LeadRadar() {
  const [queue, setQueue]           = useState([]);
  const [stats, setStats]           = useState({});
  const [tab, setTab]               = useState('pending');
  const [loading, setLoading]       = useState(true);
  const [triggering, setTriggering] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [qRes, statsRes] = await Promise.all([getRadarQueue({ status: tab }), getRadarStats()]);
      setQueue(qRes.items || []);
      setStats(statsRes || {});
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [tab]);

  const handleApprove = async (id) => {
    try { await approveQueueItem(id, REVIEWER); toast.success('Lead approved & moved to Lead Hub!'); load(); }
    catch (e) { toast.error(e.message); }
  };
  const handleReject = async (id) => {
    try { await rejectQueueItem(id, REVIEWER); toast.success('Lead rejected'); load(); }
    catch (e) { toast.error(e.message); }
  };
  const handleTrigger = async () => {
    setTriggering(true);
    try { await triggerDiscovery(); toast.success('Scanning job platforms… leads appear in a few minutes.'); }
    catch (e) { toast.error(e.message); }
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
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
              Finds companies actively hiring counsellors & wellness roles — on Naukri, LinkedIn, Indeed, Shine
            </p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleTrigger} disabled={triggering}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {triggering ? <RefreshCw size={16} className="spin" /> : <Play size={16} />}
          {triggering ? 'Scanning...' : 'Scan Job Platforms'}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
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

      {/* Cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : queue.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <Radar size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p>{tab === 'pending' ? 'No pending leads. Click "Scan Job Platforms" to find companies hiring counsellors.' : `No ${tab} leads yet.`}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {queue.map(item => (
            <RadarCard key={item._id} item={item} showActions={tab === 'pending'} onApprove={handleApprove} onReject={handleReject} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function RadarCard({ item, showActions, onApprove, onReject }) {
  const emoji = TYPE_EMOJI[item.type] || '🏢';
  const targetRole = getTargetRole(item);
  const sourceHost = shortUrl(item.source_url);

  return (
    <div className="card" style={{ position: 'relative', padding: '18px 20px' }}>
      {/* Score */}
      <div style={{
        position: 'absolute', top: 14, right: 16,
        background: item.ai_score >= 70 ? '#22c55e' : item.ai_score >= 45 ? '#f59e0b' : '#ef4444',
        color: '#fff', borderRadius: 20, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 700,
      }}>
        {item.ai_score}/100
      </div>

      {/* Org name */}
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

      {/* ① JOB POSTING SIGNAL — the reason this lead exists */}
      <div style={{
        background: '#ecfdf5', border: '1px solid #6ee7b7',
        borderLeft: '4px solid #059669', borderRadius: '0 8px 8px 0',
        padding: '9px 13px', marginBottom: 8,
      }}>
        <div style={{ fontSize: '0.68rem', color: '#065f46', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>
          📋 Job Posting Signal
        </div>
        {item.job_title_hiring_for ? (
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#064e3b' }}>
            Hiring: <span style={{ color: '#059669' }}>"{item.job_title_hiring_for}"</span>
          </div>
        ) : (
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#064e3b' }}>
            {item.why_good_lead || 'Actively hiring for mental health / counselling role'}
          </div>
        )}
        {item.discovery_source && (
          <div style={{ fontSize: '0.73rem', color: '#555', marginTop: 3 }}>
            📌 Source: <strong>{item.discovery_source}</strong>
          </div>
        )}
        {item.source_url ? (
          <a href={item.source_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.73rem', color: '#059669', fontWeight: 600, textDecoration: 'underline', display: 'block', marginTop: 3 }}>
            🔗 View job post → {sourceHost}
          </a>
        ) : (
          item.discovery_query && (
            <div style={{ fontSize: '0.71rem', color: '#666', fontStyle: 'italic', marginTop: 3 }}>
              🔍 "{item.discovery_query.slice(0, 80)}{item.discovery_query.length > 80 ? '…' : ''}"
            </div>
          )
        )}
      </div>

      {/* ② TARGET ROLE — who to call */}
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

      {/* AI score reason */}
      {item.ai_reasoning && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8, fontStyle: 'italic' }}>
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
