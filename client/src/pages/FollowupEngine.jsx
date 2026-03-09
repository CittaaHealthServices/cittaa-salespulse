import { useEffect, useState } from 'react';
import { getFollowups, createFollowup, completeFollowup, snoozeFollowup, cancelFollowup, getLeads } from '../utils/api';
import { formatDate, isOverdue, channelIcon, ownerName } from '../utils/helpers';
import toast from 'react-hot-toast';
import { Plus, Check, Clock, X, Bell } from 'lucide-react';

const CHANNELS = ['Email', 'WhatsApp', 'LinkedIn', 'Call', 'Visit'];
const STATUS_TABS = ['pending', 'completed', 'snoozed'];

const EMPTY_FORM = {
  lead_id: '', action: '', channel: 'Email', due_date: '', owner: 'S', notes: '',
};

export default function FollowupEngine() {
  const [followups, setFollowups] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const [owner, setOwner] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = async () => {
    try {
      setLoading(true);
      const params = { status: tab };
      if (owner) params.owner = owner;
      const data = await getFollowups(params);
      setFollowups(data || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [tab, owner]);
  useEffect(() => {
    getLeads({ limit: 200 }).then((r) => setLeads(r.leads || [])).catch(() => {});
  }, []);

  const handleComplete = async (id) => {
    try {
      await completeFollowup(id);
      toast.success('Marked complete ✅');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const handleSnooze = async (id) => {
    try {
      await snoozeFollowup(id, 24);
      toast.success('Snoozed 24 hours 💤');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const handleCancel = async (id) => {
    try {
      await cancelFollowup(id);
      toast.success('Cancelled');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const handleCreate = async () => {
    if (!form.lead_id || !form.action || !form.due_date) return toast.error('Fill all required fields');
    try {
      await createFollowup(form);
      toast.success('Follow-up scheduled 🔔');
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const overdue = followups.filter((f) => f.status === 'pending' && isOverdue(f.due_date));

  return (
    <div className="page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1>Follow-up Engine</h1>
          <p className="text-muted text-sm mt-1">
            {followups.length} {tab} tasks
            {overdue.length > 0 && <span style={{ color: 'var(--red)', marginLeft: 8 }}>· {overdue.length} overdue!</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select className="input" style={{ width: 130 }} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">All Owners</option>
            <option value="S">Sairam</option>
            <option value="A">Abhijay</option>
          </select>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={15} /> Schedule</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--mist)', padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {STATUS_TABS.map((t) => (
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
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', gap: 12, paddingTop: 32 }}><div className="spinner" /> <span className="text-muted">Loading…</span></div>
      ) : followups.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <Bell size={36} style={{ color: 'var(--border)', marginBottom: 12 }} />
          <p className="text-muted">No {tab} follow-ups. Schedule your first one!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {followups.map((f) => (
            <FollowupCard
              key={f._id}
              f={f}
              onComplete={handleComplete}
              onSnooze={handleSnooze}
              onCancel={handleCancel}
            />
          ))}
        </div>
      )}

      {/* Schedule Modal */}
      {showForm && (
        <div className="modal-center" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="modal">
            <div className="flex items-center justify-between mb-4">
              <h2>Schedule Follow-up</h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Lead *</label>
                <select className="input" value={form.lead_id} onChange={(e) => setForm((f) => ({ ...f, lead_id: e.target.value }))}>
                  <option value="">Select a lead…</option>
                  {leads.map((l) => <option key={l._id} value={l._id}>{l.org_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Action *</label>
                <input className="input" value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
                  placeholder="e.g. Send intro email, Follow up on proposal…" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Channel</label>
                  <select className="input" value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}>
                    {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Due Date *</label>
                  <input className="input" type="date" value={form.due_date}
                    onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Owner</label>
                  <select className="input" value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}>
                    <option value="S">Sairam</option>
                    <option value="A">Abhijay</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input className="input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}>Schedule Follow-up</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FollowupCard({ f, onComplete, onSnooze, onCancel }) {
  const overdue = f.status === 'pending' && isOverdue(f.due_date);
  const lead = f.lead_id;

  return (
    <div className="card" style={{
      borderLeft: `4px solid ${overdue ? 'var(--red)' : f.status === 'completed' ? 'var(--green)' : 'var(--purple)'}`,
      padding: '14px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          {/* Action */}
          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>{f.action}</div>

          {/* Lead info */}
          {lead && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>
              {lead.org_name} · {lead.type} · {lead.city}
            </div>
          )}

          {/* Meta row */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem' }}>{channelIcon(f.channel)} {f.channel}</span>
            <span style={{ fontSize: '0.8rem', color: overdue ? 'var(--red)' : 'var(--text-muted)', fontWeight: overdue ? 700 : 400 }}>
              {overdue ? '⚠️ ' : '📅 '}{formatDate(f.due_date)}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {ownerName(f.owner)}
            </span>
            {f.notes && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>📝 {f.notes}</span>}
          </div>
        </div>

        {/* Actions */}
        {f.status === 'pending' && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button className="btn btn-success btn-sm btn-icon" onClick={() => onComplete(f._id)} title="Mark complete">
              <Check size={14} />
            </button>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onSnooze(f._id)} title="Snooze 24h">
              <Clock size={14} />
            </button>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onCancel(f._id)} title="Cancel">
              <X size={14} />
            </button>
          </div>
        )}
        {f.status === 'completed' && (
          <span style={{ fontSize: '0.75rem', color: 'var(--green)', fontWeight: 600 }}>✅ Done</span>
        )}
        {f.status === 'snoozed' && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>💤 Snoozed</span>
        )}
      </div>
    </div>
  );
}
