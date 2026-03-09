import { useEffect, useState } from 'react';
import { getStats } from '../utils/api';
import { formatCurrency, formatRelative, ownerName } from '../utils/helpers';
import { TrendingUp, Users, Bell, CheckCircle, Zap, Clock } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats().then(setStats).catch(console.error).finally(() => setLoading(false));
    const t = setInterval(() => getStats().then(setStats).catch(() => {}), 30000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 60 }}>
        <div className="spinner" /> <span className="text-muted">Loading dashboard…</span>
      </div>
    );
  }

  const s = stats || {};
  const leads = s.leads || {};
  const pipeline = s.pipeline || {};
  const followups = s.followups || {};
  const radar = s.radar || {};
  const activities = s.recent_activities || [];

  return (
    <div className="page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1>Dashboard</h1>
          <p className="text-muted text-sm mt-1">Good morning — here's what's happening today.</p>
        </div>
        {radar.pending_queue > 0 && (
          <a href="/radar" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'linear-gradient(135deg, var(--purple-faint), var(--teal-faint))',
              border: '1.5px solid var(--purple)',
              borderRadius: 10, padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: 10
            }}>
              <span style={{ fontSize: '1.1rem' }} className="pulse">🔍</span>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--purple)' }}>
                  {radar.pending_queue} new leads discovered
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Pending approval in Lead Radar</div>
              </div>
            </div>
          </a>
        )}
      </div>

      {/* Stats */}
      <div className="stats-grid mb-6">
        <StatCard icon={<Users size={20} />} color="var(--purple)" label="Total Leads" value={leads.total || 0} />
        <StatCard icon={<TrendingUp size={20} />} color="var(--teal)" label="Pipeline Value" value={formatCurrency(pipeline.total_value)} />
        <StatCard icon={<CheckCircle size={20} />} color="#2ec27e" label="Won" value={formatCurrency(pipeline.won_value)} />
        <StatCard icon={<Zap size={20} />} color="#f0923a" label="High Priority" value={leads.high_priority || 0} />
        <StatCard icon={<Bell size={20} />} color={followups.overdue > 0 ? '#e84c4c' : 'var(--purple)'} label="Overdue Tasks" value={followups.overdue || 0} />
        <StatCard icon={<Clock size={20} />} color="var(--teal)" label="Due Today" value={followups.today || 0} />
      </div>

      {/* Pipeline Summary */}
      <div className="grid-2 mb-6">
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Pipeline Stages</h3>
          {Object.entries(leads.by_stage || {}).map(([stage, count]) => (
            <PipelineRow key={stage} stage={stage} count={count} total={leads.total || 1} />
          ))}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Lead Mix</h3>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <MixCard label="Schools" count={leads.by_type?.school || 0} color="var(--purple)" emoji="🏫" />
            <MixCard label="Corporates" count={leads.by_type?.corporate || 0} color="var(--teal)" emoji="🏢" />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <MixCard label="Win Rate" count={`${pipeline.win_rate || 0}%`} color="#2ec27e" emoji="🏆" />
            <MixCard label="Pending Q" count={radar.pending_queue || 0} color="var(--orange)" emoji="📡" />
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Recent Activity</h3>
        {activities.length === 0 ? (
          <p className="text-muted text-sm">No activity yet. Add your first lead to get started.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {activities.map((a, i) => (
              <div
                key={a._id || i}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '11px 0',
                  borderBottom: i < activities.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'var(--purple-faint)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: '0.85rem',
                }}>
                  {typeEmoji(a.type)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.875rem' }}>{a.description}</div>
                  {a.lead_id && (
                    <div className="text-xs text-muted mt-1">
                      {a.lead_id.org_name} · {a.lead_id.type}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted" style={{ flexShrink: 0 }}>
                  {formatRelative(a.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, color, label, value }) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color }}>
        {icon}
      </div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function PipelineRow({ stage, count, total }) {
  const pct = Math.round((count / total) * 100);
  const colors = {
    New: 'var(--purple)', Contacted: '#f5c842', 'Proposal Sent': 'var(--teal)',
    Negotiation: '#f0923a', Won: '#2ec27e', Lost: '#e84c4c',
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{stage}</span>
        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{count}</span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: colors[stage] || 'var(--purple)', borderRadius: 3 }} />
      </div>
    </div>
  );
}

function MixCard({ label, count, color, emoji }) {
  return (
    <div style={{
      flex: 1, background: 'var(--mist)', borderRadius: 10,
      padding: '12px 14px', border: '1.5px solid var(--border)',
    }}>
      <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>{emoji}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color }}>{count}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

function typeEmoji(type) {
  const map = {
    lead_created: '➕', stage_change: '↗️', followup_scheduled: '🔔',
    followup_completed: '✅', message_sent: '✉️', lead_discovered: '🔍', note_added: '📝',
  };
  return map[type] || '•';
}
