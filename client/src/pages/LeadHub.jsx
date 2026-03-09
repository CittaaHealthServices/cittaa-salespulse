import { useEffect, useState } from 'react';
import { getLeads, createLead, updateLead, deleteLead, getLeadActivities } from '../utils/api';
import { formatCurrency, formatRelative, scoreClass, stageBadgeClass, priorityClass, ownerName } from '../utils/helpers';
import toast from 'react-hot-toast';
import { Plus, Search, X, ChevronDown, Trash2, ExternalLink } from 'lucide-react';

const STAGES = ['New', 'Contacted', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'];
const EMPTY_LEAD = {
  type: 'school', org_name: '', contact_name: '', role: '', city: '', state: '',
  email: '', phone: '', linkedin_url: '', employees_or_students: '', stage: 'New',
  contract_value: '', ai_score: 50, priority: 'medium', owner: 'S', notes: '',
};

export default function LeadHub() {
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ type: '', stage: '', owner: '', search: '' });
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(EMPTY_LEAD);
  const [editing, setEditing] = useState(false);
  const [activities, setActivities] = useState([]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await getLeads(filters);
      setLeads(res.leads || []);
      setTotal(res.total || 0);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filters]);

  const openDetail = async (lead) => {
    setSelected(lead);
    try {
      const acts = await getLeadActivities(lead._id);
      setActivities(acts || []);
    } catch {}
  };

  const handleSave = async () => {
    try {
      if (editing) {
        const updated = await updateLead(formData._id, formData);
        toast.success('Lead updated');
        setSelected(updated);
      } else {
        await createLead(formData);
        toast.success('Lead created');
      }
      setShowForm(false);
      setEditing(false);
      setFormData(EMPTY_LEAD);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this lead?')) return;
    try {
      await deleteLead(id);
      toast.success('Deleted');
      setSelected(null);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const handleStageChange = async (lead, stage) => {
    try {
      await updateLead(lead._id, { stage });
      toast.success(`Moved to ${stage}`);
      setSelected((prev) => prev ? { ...prev, stage } : prev);
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1>Lead Hub</h1>
          <p className="text-muted text-sm mt-1">{total} leads total</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setFormData(EMPTY_LEAD); setEditing(false); setShowForm(true); }}>
          <Plus size={16} /> Add Lead
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="input" placeholder="Search leads…"
            style={{ paddingLeft: 32 }}
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>
        <select className="input" style={{ flex: '0 0 130px' }} value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
          <option value="">All Types</option>
          <option value="school">School</option>
          <option value="corporate">Corporate</option>
        </select>
        <select className="input" style={{ flex: '0 0 150px' }} value={filters.stage} onChange={(e) => setFilters((f) => ({ ...f, stage: e.target.value }))}>
          <option value="">All Stages</option>
          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input" style={{ flex: '0 0 120px' }} value={filters.owner} onChange={(e) => setFilters((f) => ({ ...f, owner: e.target.value }))}>
          <option value="">All Owners</option>
          <option value="S">Sairam</option>
          <option value="A">Abhijay</option>
        </select>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Organisation</th>
              <th>Type</th>
              <th>Contact</th>
              <th>City</th>
              <th>Stage</th>
              <th>Score</th>
              <th>Priority</th>
              <th>Value</th>
              <th>Owner</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No leads found. Add your first lead!</td></tr>
            ) : leads.map((lead) => (
              <tr key={lead._id} onClick={() => openDetail(lead)}>
                <td>
                  <div style={{ fontWeight: 600, maxWidth: 200 }} className="truncate">{lead.org_name}</div>
                  {lead.source === 'auto_discovered' && <span style={{ fontSize: '0.68rem', color: 'var(--teal)', fontWeight: 600 }}>📡 Auto</span>}
                </td>
                <td><span className={`badge badge-${lead.type}`}>{lead.type}</span></td>
                <td><div className="truncate" style={{ maxWidth: 140 }}>{lead.contact_name || '—'}</div></td>
                <td>{lead.city || '—'}</td>
                <td><span className={`badge ${stageBadgeClass(lead.stage)}`}>{lead.stage}</span></td>
                <td><span className={`score-pill ${scoreClass(lead.ai_score)}`}>{lead.ai_score}</span></td>
                <td><span className={`badge ${priorityClass(lead.priority)}`}>{lead.priority}</span></td>
                <td>{formatCurrency(lead.contract_value)}</td>
                <td><span style={{ fontWeight: 600, color: 'var(--purple)' }}>{lead.owner}</span></td>
                <td className="text-muted text-sm">{formatRelative(lead.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Drawer */}
      {selected && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className="drawer">
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ maxWidth: 360 }} className="truncate">{selected.org_name}</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setFormData(selected); setEditing(true); setShowForm(true); setSelected(null); }}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selected._id)}><Trash2 size={14} /></button>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelected(null)}><X size={16} /></button>
              </div>
            </div>

            {/* Badges */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              <span className={`badge badge-${selected.type}`}>{selected.type}</span>
              <span className={`badge ${stageBadgeClass(selected.stage)}`}>{selected.stage}</span>
              <span className={`badge ${priorityClass(selected.priority)}`}>{selected.priority}</span>
              <span className={`score-pill ${scoreClass(selected.ai_score)}`}>{selected.ai_score}</span>
              {selected.source === 'auto_discovered' && <span className="badge" style={{ background: 'var(--teal-faint)', color: 'var(--teal-dark)' }}>📡 Auto-discovered</span>}
            </div>

            {/* Change Stage */}
            <div className="form-group mb-4">
              <label className="form-label">Change Stage</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STAGES.map((s) => (
                  <button key={s} className={`btn btn-sm ${selected.stage === s ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => handleStageChange(selected, s)}>{s}</button>
                ))}
              </div>
            </div>

            {/* Details grid */}
            <div className="grid-2" style={{ gap: 14, marginBottom: 20 }}>
              <DetailField label="Contact" value={selected.contact_name} />
              <DetailField label="Role" value={selected.role} />
              <DetailField label="Email" value={selected.email} />
              <DetailField label="Phone" value={selected.phone} />
              <DetailField label="City" value={selected.city} />
              <DetailField label="State" value={selected.state} />
              <DetailField label="Size" value={selected.employees_or_students ? `${selected.employees_or_students.toLocaleString()} ${selected.type === 'school' ? 'students' : 'employees'}` : null} />
              <DetailField label="Contract Value" value={formatCurrency(selected.contract_value)} />
              <DetailField label="Owner" value={ownerName(selected.owner)} />
            </div>

            {selected.linkedin_url && (
              <a href={selected.linkedin_url} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--teal)', fontSize: '0.875rem', marginBottom: 16, textDecoration: 'none' }}>
                <ExternalLink size={14} /> LinkedIn Profile
              </a>
            )}

            {selected.notes && (
              <div style={{ background: 'var(--mist)', borderRadius: 8, padding: 14, marginBottom: 20 }}>
                <div className="form-label mb-2">Notes</div>
                <div style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{selected.notes}</div>
              </div>
            )}

            {/* Activity log */}
            <h3 style={{ marginBottom: 12 }}>Activity Log</h3>
            {activities.length === 0 ? (
              <p className="text-muted text-sm">No activity yet.</p>
            ) : activities.map((a, i) => (
              <div key={a._id || i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>•</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem' }}>{a.description}</div>
                  <div className="text-xs text-muted mt-1">{formatRelative(a.created_at)} · {a.created_by}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add / Edit Form Modal */}
      {showForm && (
        <div className="modal-center" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="modal">
            <div className="flex items-center justify-between mb-4">
              <h2>{editing ? 'Edit Lead' : 'Add New Lead'}</h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <LeadForm data={formData} onChange={setFormData} />
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Save Changes' : 'Create Lead'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }) {
  if (!value || value === '—') return null;
  return (
    <div>
      <div className="form-label">{label}</div>
      <div style={{ fontSize: '0.875rem', marginTop: 2, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function LeadForm({ data, onChange }) {
  const set = (k, v) => onChange((d) => ({ ...d, [k]: v }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Type *</label>
          <select className="input" value={data.type} onChange={(e) => set('type', e.target.value)}>
            <option value="school">School</option>
            <option value="corporate">Corporate</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Organisation Name *</label>
          <input className="input" value={data.org_name} onChange={(e) => set('org_name', e.target.value)} placeholder="e.g. DPS Hyderabad" />
        </div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Contact Name</label>
          <input className="input" value={data.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Role</label>
          <input className="input" value={data.role} onChange={(e) => set('role', e.target.value)} placeholder="Principal / HR Head" />
        </div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Email</label>
          <input className="input" type="email" value={data.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Phone</label>
          <input className="input" value={data.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">City</label>
          <input className="input" value={data.city} onChange={(e) => set('city', e.target.value)} placeholder="Hyderabad" />
        </div>
        <div className="form-group">
          <label className="form-label">State</label>
          <input className="input" value={data.state} onChange={(e) => set('state', e.target.value)} placeholder="Telangana" />
        </div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Students / Employees</label>
          <input className="input" type="number" value={data.employees_or_students} onChange={(e) => set('employees_or_students', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Contract Value (₹)</label>
          <input className="input" type="number" value={data.contract_value} onChange={(e) => set('contract_value', e.target.value)} />
        </div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Stage</label>
          <select className="input" value={data.stage} onChange={(e) => set('stage', e.target.value)}>
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Priority</label>
          <select className="input" value={data.priority} onChange={(e) => set('priority', e.target.value)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">AI Score (0-100)</label>
          <input className="input" type="number" min={0} max={100} value={data.ai_score} onChange={(e) => set('ai_score', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Owner</label>
          <select className="input" value={data.owner} onChange={(e) => set('owner', e.target.value)}>
            <option value="S">Sairam</option>
            <option value="A">Abhijay</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">LinkedIn URL</label>
        <input className="input" value={data.linkedin_url} onChange={(e) => set('linkedin_url', e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea className="input" value={data.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
      </div>
    </div>
  );
}
