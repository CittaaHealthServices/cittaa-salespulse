import { useEffect, useState, useCallback } from 'react';
import { getPipeline, updateStage } from '../utils/api';
import { formatCurrency, scoreClass, priorityClass } from '../utils/helpers';
import toast from 'react-hot-toast';

const STAGES = ['New', 'Contacted', 'Proposal Sent', 'Negotiation', 'Won'];
const STAGE_COLORS = {
  New: '#8B5A96', Contacted: '#f5c842', 'Proposal Sent': '#7BB3A8',
  Negotiation: '#f0923a', Won: '#2ec27e',
};

export default function Pipeline() {
  const [board, setBoard] = useState({});
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(null); // { lead, fromStage }
  const [dragOver, setDragOver] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const data = await getPipeline();
      setBoard(data || {});
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const totalValue = (stage) =>
    (board[stage] || []).reduce((sum, l) => sum + (l.contract_value || 0), 0);

  const handleDragStart = (e, lead, fromStage) => {
    setDragging({ lead, fromStage });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, stage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(stage);
  };

  const handleDrop = async (e, toStage) => {
    e.preventDefault();
    setDragOver(null);
    if (!dragging || dragging.fromStage === toStage) { setDragging(null); return; }

    const { lead, fromStage } = dragging;
    setDragging(null);

    // Optimistic update
    setBoard((prev) => {
      const next = { ...prev };
      next[fromStage] = (next[fromStage] || []).filter((l) => l._id !== lead._id);
      next[toStage] = [{ ...lead, stage: toStage }, ...(next[toStage] || [])];
      return next;
    });

    try {
      await updateStage(lead._id, toStage);
      toast.success(`${lead.org_name} → ${toStage}`);
    } catch (err) {
      toast.error(err.message);
      load(); // Revert on error
    }
  };

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 60 }}>
        <div className="spinner" /> <span className="text-muted">Loading pipeline…</span>
      </div>
    );
  }

  const totalPipelineValue = STAGES.slice(0, 4).reduce((sum, s) => sum + totalValue(s), 0);

  return (
    <div className="page" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1>Pipeline Board</h1>
          <p className="text-muted text-sm mt-1">
            Active pipeline: <strong>{formatCurrency(totalPipelineValue)}</strong>
            {' · '}
            {STAGES.slice(0, 4).reduce((sum, s) => sum + (board[s]?.length || 0), 0)} leads
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {STAGES.map((stage) => (
          <div key={stage} style={{
            background: 'white', border: '1.5px solid var(--border)',
            borderRadius: 10, padding: '8px 14px', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: STAGE_COLORS[stage] }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{stage}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {board[stage]?.length || 0} leads · {formatCurrency(totalValue(stage))}
            </div>
          </div>
        ))}
      </div>

      {/* Kanban Board */}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 20, minHeight: 500 }}>
        {STAGES.map((stage) => (
          <div
            key={stage}
            className="kanban-col"
            style={{
              borderTop: `3px solid ${STAGE_COLORS[stage]}`,
              background: dragOver === stage ? 'var(--purple-faint)' : 'white',
              transition: 'background 0.15s',
            }}
            onDragOver={(e) => handleDragOver(e, stage)}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => handleDrop(e, stage)}
          >
            {/* Column header */}
            <div className="kanban-col-header">
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{stage}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>
                  {board[stage]?.length || 0} · {formatCurrency(totalValue(stage))}
                </div>
              </div>
            </div>

            {/* Cards */}
            <div style={{ minHeight: 80 }}>
              {(board[stage] || []).map((lead) => (
                <KanbanCard
                  key={lead._id}
                  lead={lead}
                  stage={stage}
                  onDragStart={handleDragStart}
                  isDragging={dragging?.lead?._id === lead._id}
                />
              ))}
              {(board[stage] || []).length === 0 && (
                <div style={{
                  textAlign: 'center', padding: '20px 0',
                  color: 'var(--text-muted)', fontSize: '0.78rem',
                  border: '2px dashed var(--border)', borderRadius: 8,
                }}>
                  Drop leads here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KanbanCard({ lead, stage, onDragStart, isDragging }) {
  return (
    <div
      className="kanban-card"
      draggable
      onDragStart={(e) => onDragStart(e, lead, stage)}
      style={{ opacity: isDragging ? 0.45 : 1 }}
    >
      {/* Org + type */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.3 }}>{lead.org_name}</div>
        <span className={`badge badge-${lead.type}`} style={{ flexShrink: 0 }}>{lead.type}</span>
      </div>

      {/* Contact */}
      {lead.contact_name && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
          {lead.contact_name}
        </div>
      )}

      {lead.city && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
          📍 {lead.city}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className={`score-pill ${scoreClass(lead.ai_score)}`}>{lead.ai_score}</span>
          <span className={`badge ${priorityClass(lead.priority)}`}>{lead.priority}</span>
        </div>
        {lead.contract_value > 0 && (
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--purple)' }}>
            {formatCurrency(lead.contract_value)}
          </span>
        )}
      </div>

      {/* Owner */}
      <div style={{ textAlign: 'right', marginTop: 6 }}>
        <span style={{
          fontSize: '0.68rem', fontWeight: 700,
          background: lead.owner === 'S' ? 'var(--purple-faint)' : 'var(--teal-faint)',
          color: lead.owner === 'S' ? 'var(--purple)' : 'var(--teal-dark)',
          padding: '1px 7px', borderRadius: 10,
        }}>
          {lead.owner}
        </span>
      </div>
    </div>
  );
}
