import { useEffect, useState } from 'react';
import { getRadarQueue, approveQueueItem, rejectQueueItem, getDiscoveryLogs, getRadarStats, triggerDiscovery } from '../utils/api';
import { formatCurrency, formatRelative, scoreClass } from '../utils/helpers';
import toast from 'react-hot-toast';
import { Radar, Play, Check, X, Clock, RefreshCw } from 'lucide-react';

const REVIEWER = 'S'; // Default reviewer — could be dynamic

// ─── Target role fallback (mirrors server/services/emailService.js) ───────────
function targetRoleLabel(lead) {
  if (lead.role) return lead.role;
  const defaults = {
    school:    'Principal / Vice Principal / Counselling Coordinator',
    coaching:  'Centre Director / Academic Head',
    corporate: 'HR Head / CHRO / Wellness Manager',
    clinic:    'Founder / Lead Psychologist / Director',
    ngo:       'Programme Director / CEO',
    rehab:     'Centre Director / Head Therapist',
  };
  return defaults[lead.type] || 'Decision Maker';
}

export default function LeadRadar() {
  const [queue, setQueue] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({});
  const [tab, setTab] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [total, setTotal] = useState(0);

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
      toast.success('✅ Approved! Lead added to Lead Hub');
      setQueue((q) => q.filter((item) => item._id !== id));
    } catch (e) { toast.error(e.message); }
  };

  const handleReject = async (id) => {
    try {
      await rejectQueueItem(id, REVIEWER);
      toast.success('Rejected');
      setQueue((q) => q.filter((item) => item._id !== id));
    } catch (e) { toast.error(e.message); }
  };

  const handleRunNow = async () => {
    setTriggering(true);
    try {
      await triggerDiscovery();
      toast.success('🔍 Discovery job triggered! Check back in ~2 minutes.');
      setTimeout(load, 3000);
    } catch (e) { toast.error(e.message); }
    finally { setTimeout(() => setTriggering(false), 3000); }
  };

  return (
    <div className="page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Radar size={26} style={{ color: 'var(--teal)' }} />
            Lead Radar
          </h1>
          <p className="text-muted text-sm mt-1">
            Auto-discovered leads from Gemini + Google Search · runs every 6 hours
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
          <button className="btn btn-primary" onClick={handleRunNow} disabled={triggering}>
            <Play size={14} /> {triggering ? 'Triggered…' : 'Run Discovery Now'}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{
        background: 'white', border: '1.5px solid var(--border)', borderRadius: 12,
        padding: '14px 20px', marginBottom: 24,
        display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <StatChip label="Pending Queue" value={stats.pending || 0} color="var(--purple)" emoji="⏳" />
        <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
        <StatChip label="Approved This Week" value={stats.approvedThisWeek || 0} color="var(--green)" emoji="✅" />
        <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
        <StatChip label="Rejected" value={stats.rejectedThisWeek || 0} color="var(--red)" emoji="✗" />
        <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <Clock size={13} style={{ display: 'inline', marginRight: 5 }} />
          Last run: {stats.lastRun ? formatRelative(stats.lastRun) : 'Never'}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--mist)', padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {['pending', 'approved', 'rejected'].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600,
              background: tab === t ? 'white' : 'transparent',
              color: tab === t ? 'var(--ink)' : 'var(--text-muted)',
              boxShadow: tab === t ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s',
            }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'pending' && (stats.pending || 0) > 0 && (
              <span style={{
                marginLeft: 6, background: 'var(--purple)', color: 'white',
                borderRadius: 10, padding: '0 6px', fontSize: '0.7rem', fontWeight: 700,
              }}>{stats.pending}</span>
            )}
          </button>
        ))}
      </div>

      {/* Queue grid */}
      {loading ? (
        <div style={{ display: 'flex', gap: 12, paddingTop: 32 }}><div className="spinner" /> <span className="text-muted">Loading…</span></div>
      ) : queue.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 64 }}>
          <Radar size={44} style={{ color: 'var(--border)', marginBottom: 16 }} />
          <h3 style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
            {tab === 'pending' ? 'No pending leads in queue' : `No ${tab} leads`}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>
            {tab === 'pending' ? 'Click "Run Discovery Now" or wait for the automatic 6-hour scan.' : ''}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginBottom: 32 }}>
          {queue.map((item) => (
            <QueueCard
              key={item._id}
              item={item}
              showActions={tab === 'pending'}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}

      {/* Discovery Logs */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Discovery Run History</h3>
        {logs.length === 0 ? (
          <p className="text-muted text-sm">No discovery runs yet. Click "Run Discovery Now" to start.</p>
        ) : (
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Run Time</th>
                  <th>Queries</th>
                  <th>Found</th>
                  <th>Added to Queue</th>
                  <th>Duplicates Skipped</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id}>
                    <td style={{ fontSize: '0.8rem' }}>{new Date(log.run_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{log.queries_run?.length || 0}</td>
                    <td>{log.leads_found || 0}</td>
                    <td style={{ fontWeight: 600, color: 'var(--teal)' }}>{log.leads_added_to_queue || 0}</td>
                    <td className="text-muted">{log.duplicates_skipped || 0}</td>
                    <td className="text-muted">{log.duration_seconds ? `${log.duration_seconds}s` : '—'}</td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '2px 9px', borderRadius: 20,
                        fontSize: '0.72rem', fontWeight: 700,
                        background: log.status === 'success' ? '#e8f5e9' : log.status === 'failed' ? '#fce4ec' : '#fff8e1',
                        color: log.status === 'success' ? '#2e7d32' : log.status === 'failed' ? '#c62828' : '#c77700',
                      }}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function QueueCard({ item, showActions, onApprove, onReject }) {
  const scoreColor = item.ai_score >= 70 ? '#2e7d32' : item.ai_score >= 45 ? '#c77700' : '#c62828';
  const scoreBg = item.ai_score >= 70 ? '#e8f5e9' : item.ai_score >= 45 ? '#fff8e1' : '#fce4ec';

  return (
    <div className="card" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Score ribbon */}
      <div style={{
        position: 'absolute', top: 12, right: 12,
        background: scoreBg, color: scoreColor,
        borderRadius: 20, padding: '3px 10px', fontWeight: 800,
        fontSize: '0.85rem', fontFamily: 'DM Mono, monospace',
      }}>
        {item.ai_score}
      </div>

      {/* Type badge */}
      <span className={`badge badge-${item.type}`} style={{ marginBottom: 10, display: 'inline-block' }}>{item.type}</span>

      {/* Org name */}
      <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4, paddingRight: 48 }}>{item.org_name}</div>

      {/* Location + size */}
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
        📍 {item.city || '—'}{item.state ? `, ${item.state}` : ''}
        {item.employees_or_students && (
          <span style={{ marginLeft: 10 }}>
            👥 {item.employees_or_students.toLocaleString()} {item.type === 'school' ? 'students' : 'employees'}
          </span>
        )}
      </div>

      {/* Target Role for Outreach — always shown */}
      <div style={{
        background: 'var(--mist)', border: '1px solid var(--purple-light, #e9e0ff)',
        borderLeft: '3px solid var(--purple)', borderRadius: 6,
        padding: '7px 10px', marginBottom: 8, fontSize: '0.8rem',
      }}>
        <span style={{ color: 'var(--purple)', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          🎯 Target Role for Outreach
        </span>
        <div style={{ fontWeight: 600, color: 'var(--ink)', marginTop: 2 }}>
          {targetRoleLabel(item)}
        </div>
        {item.contact_name && (
          <div style={{ marginTop: 3, color: 'var(--text-muted)' }}>
            👤 {item.contact_name}{item.role ? ` · ${item.role}` : ''}
          </div>
        )}
        {item.email && (
          <div style={{ marginTop: 2, color: 'var(--text-muted)' }}>📧 {item.email}</div>
        )}
        {item.phone && (
          <div style={{ marginTop: 2, color: 'var(--text-muted)' }}>📞 {item.phone}</div>
        )}
      </div>

      {/* Estimated value */}
      {item.estimated_value > 0 && (
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--purple)', marginBottom: 10 }}>
          💰 Est. {formatCurrency(item.estimated_value)} / year
        </div>
      )}

      {/* AI Reasoning */}
      {item.ai_reasoning && (
        <div style={{
          background: 'var(--mist)', borderRadius: 8, padding: '9px 11px',
          fontSize: '0.79rem', color: 'var(--ink)', marginBottom: 12, lineHeight: 1.5,
          borderLeft: '3px solid var(--purple)',
        }}>
          ✨ {item.ai_reasoning}
        </div>
      )}

      {/* Source */}
      {item.source_url && (
        <a href={item.source_url} target="_blank" rel="noreferrer"
          style={{ fontSize: '0.72rem', color: 'var(--teal)', display: 'block', marginBottom: 12, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          🔗 {item.source_url}
        </a>
      )}

      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: showActions ? 14 : 0 }}>
        Discovered {formatRelative(item.discovered_at)}
        {item.status !== 'pending' && ` · ${item.status} by ${item.reviewed_by}`}
      </div>

      {/* Action buttons */}
      {showActions && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-success" style={{ flex: 1 }} onClick={() => onApprove(item._id)}>
            <Check size={15} /> Approve
          </button>
          <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => onReject(item._id)}>
            <X size={15} /> Reject
          </button>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, color, emoji }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: '1rem' }}>{emoji}</span>
      <div>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}
