import { useState, useEffect } from 'react';
import { getLeads, composeMessage } from '../utils/api';
import toast from 'react-hot-toast';
import { Sparkles, Copy, RefreshCw } from 'lucide-react';

const CHANNELS = ['Email', 'WhatsApp', 'LinkedIn', 'Proposal'];
const TONES = ['Professional', 'Friendly', 'Urgent', 'Consultative'];

export default function AIComposer() {
  const [leads, setLeads] = useState([]);
  const [form, setForm] = useState({
    lead_id: '', channel: 'Email', tone: 'Professional', custom_context: '',
  });
  const [selectedLead, setSelectedLead] = useState(null);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    getLeads({ limit: 100 }).then((r) => setLeads(r.leads || [])).catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleLeadChange = (id) => {
    set('lead_id', id);
    const lead = leads.find((l) => l._id === id);
    setSelectedLead(lead || null);
  };

  const handleCompose = async () => {
    if (!selectedLead && !form.lead_id) {
      // Allow composing without a lead (free-form)
    }
    if (!form.channel) return toast.error('Select a channel');
    setLoading(true);
    try {
      const payload = {
        lead_id: form.lead_id || undefined,
        channel: form.channel,
        lead_type: selectedLead?.type || 'corporate',
        org_name: selectedLead?.org_name || 'Your Organisation',
        contact_name: selectedLead?.contact_name || '',
        city: selectedLead?.city || '',
        role: selectedLead?.role || '',
        tone: form.tone,
        custom_context: form.custom_context,
        created_by: 'S',
      };
      const res = await composeMessage(payload);
      setResult(res.content || '');
      setHistory((h) => [
        { ...payload, content: res.content, ts: new Date() },
        ...h.slice(0, 9),
      ]);
      toast.success('Message generated!');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(result);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1>AI Composer</h1>
          <p className="text-muted text-sm mt-1">Generate personalised messages with Gemini AI</p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'linear-gradient(135deg, var(--purple-faint), var(--teal-faint))',
          border: '1.5px solid var(--purple)', borderRadius: 10, padding: '6px 14px',
        }}>
          <Sparkles size={16} style={{ color: 'var(--purple)' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--purple)' }}>Powered by Gemini 2.0</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Left: Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Compose Settings</h3>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Lead (optional)</label>
              <select className="input" value={form.lead_id} onChange={(e) => handleLeadChange(e.target.value)}>
                <option value="">— Free compose —</option>
                {leads.map((l) => (
                  <option key={l._id} value={l._id}>{l.org_name} ({l.type})</option>
                ))}
              </select>
            </div>

            {selectedLead && (
              <div style={{
                background: 'var(--mist)', borderRadius: 8, padding: '10px 12px',
                marginBottom: 12, fontSize: '0.8rem',
              }}>
                <div style={{ fontWeight: 600 }}>{selectedLead.org_name}</div>
                {selectedLead.contact_name && <div className="text-muted">{selectedLead.contact_name} · {selectedLead.role}</div>}
                <div className="text-muted">{selectedLead.city} · {selectedLead.type}</div>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Channel</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {CHANNELS.map((ch) => (
                  <button key={ch} className={`btn btn-sm ${form.channel === ch ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => set('channel', ch)}>{ch}</button>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Tone</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TONES.map((t) => (
                  <button key={t} className={`btn btn-sm ${form.tone === t ? 'btn-teal' : 'btn-ghost'}`}
                    onClick={() => set('tone', t)}>{t}</button>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Custom Context (optional)</label>
              <textarea className="input" rows={3} value={form.custom_context}
                onChange={(e) => set('custom_context', e.target.value)}
                placeholder="Add any specific details, recent news about the company, or special angle…" />
            </div>

            <button className="btn btn-primary w-full" onClick={handleCompose} disabled={loading}>
              {loading ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Generating…</> : <><Sparkles size={15} /> Generate Message</>}
            </button>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: 12 }}>Recent Generations</h3>
              {history.map((h, i) => (
                <div key={i} style={{
                  padding: '9px 0', borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                }} onClick={() => setResult(h.content)}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{h.org_name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{h.channel} · {h.tone}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Output */}
        <div>
          {result ? (
            <div className="card" style={{ height: '100%' }}>
              <div className="flex items-center justify-between mb-4">
                <h3>Generated Message</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={handleCompose} disabled={loading}>
                    <RefreshCw size={14} /> Regenerate
                  </button>
                  <button className="btn btn-teal btn-sm" onClick={handleCopy}>
                    <Copy size={14} /> Copy
                  </button>
                </div>
              </div>
              <div style={{
                whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: '0.9rem',
                background: 'var(--mist)', borderRadius: 10, padding: 18,
                border: '1.5px solid var(--border)', minHeight: 300,
              }}>
                {result}
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                  {result.split(/\s+/).length} words · {result.length} chars
                </span>
                <button className="btn btn-primary btn-sm" onClick={handleCopy}>
                  <Copy size={13} /> Copy to Clipboard
                </button>
              </div>
            </div>
          ) : (
            <div className="card" style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', minHeight: 400, textAlign: 'center',
              background: 'linear-gradient(135deg, var(--mist), white)',
            }}>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>✨</div>
              <h3 style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                Select a lead and channel, then click Generate
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8, maxWidth: 320 }}>
                Cittaa SalesPulse will craft a personalised, conversion-optimised message using Gemini AI
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
