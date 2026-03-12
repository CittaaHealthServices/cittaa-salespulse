import { useState, useEffect, useCallback } from 'react';

const API = '/api/radar';

const TYPE_TABS = [
  { key: 'all',          label: 'All Leads' },
  { key: 'university',   label: '🎓 Universities' },
  { key: 'school',       label: '🏫 Schools' },
  { key: 'corporate',    label: '🏢 Corporate' },
  { key: 'clinic',       label: '🏥 Clinics' },
  { key: 'ngo',          label: '🤝 NGOs' },
  { key: 'other',        label: 'Other' },
];

const STATUS_TABS = [
  { key: 'pending',  label: 'Pending Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

// Map URL to recognisable platform name + colour
function parsePlatform(url, notes) {
  if (!url) {
    // Try to extract from notes like "[Posted on Naukri] ..."
    if (notes) {
      const m = notes.match(/\[Posted on ([^\]]+)\]/);
      if (m) return m[1];
    }
    return '';
  }
  try {
    const host = new URL(url).hostname.replace('www.', '').toLowerCase();
    if (host.includes('naukri'))       return 'Naukri';
    if (host.includes('linkedin'))     return 'LinkedIn';
    if (host.includes('indeed'))       return 'Indeed';
    if (host.includes('timesjobs'))    return 'TimesJobs';
    if (host.includes('shine'))        return 'Shine';
    if (host.includes('monsterindia') || host.includes('foundit')) return 'Foundit';
    if (host.includes('glassdoor'))    return 'Glassdoor';
    if (host.includes('ambitionbox'))  return 'AmbitionBox';
    if (host.includes('internshala')) return 'Internshala';
    if (host.includes('hirist'))       return 'Hirist';
    if (host.includes('twitter') || host.includes('x.com')) return 'Twitter/X';
    if (host.includes('facebook'))     return 'Facebook';
    if (host.includes('instagram'))    return 'Instagram';
    if (host.includes('google'))       return '';  // Google search fallback — don't show
    return '';
  } catch { return ''; }
}

const PLATFORM_COLORS = {
  'Naukri':      'bg-orange-100 text-orange-700 border-orange-200',
  'LinkedIn':    'bg-blue-100 text-blue-700 border-blue-200',
  'Indeed':      'bg-indigo-100 text-indigo-700 border-indigo-200',
  'TimesJobs':   'bg-red-100 text-red-700 border-red-200',
  'Shine':       'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Foundit':     'bg-purple-100 text-purple-700 border-purple-200',
  'Glassdoor':   'bg-green-100 text-green-700 border-green-200',
  'AmbitionBox': 'bg-teal-100 text-teal-700 border-teal-200',
  'Internshala': 'bg-pink-100 text-pink-700 border-pink-200',
  'Twitter/X':   'bg-gray-100 text-gray-700 border-gray-200',
  'Facebook':    'bg-blue-100 text-blue-800 border-blue-200',
  'Instagram':   'bg-pink-100 text-pink-700 border-pink-200',
};

function PlatformBadge({ url, notes }) {
  const name = parsePlatform(url, notes);
  if (!name) return null;
  const color = PLATFORM_COLORS[name] || 'bg-gray-100 text-gray-600 border-gray-200';
  const isLink = url && !url.includes('google.com/search');
  if (isLink) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${color} hover:opacity-80 transition-opacity`}
        title={`View on ${name}`}
      >
        🔗 {name}
      </a>
    );
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-semibold ${color}`}>
      {name}
    </span>
  );
}

function scoreColor(score) {
  if (score >= 80) return 'bg-green-100 text-green-800';
  if (score >= 60) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

function typeBadge(type, discoverySource) {
  if (discoverySource === 'Universities') return 'bg-purple-100 text-purple-700';
  const map = {
    school:    'bg-blue-100 text-blue-700',
    corporate: 'bg-indigo-100 text-indigo-700',
    clinic:    'bg-pink-100 text-pink-700',
    ngo:       'bg-teal-100 text-teal-700',
    coaching:  'bg-orange-100 text-orange-700',
    rehab:     'bg-red-100 text-red-700',
  };
  return map[type] || 'bg-gray-100 text-gray-700';
}

function typeLabel(type, discoverySource) {
  if (discoverySource === 'Universities') return 'University/College';
  const map = {
    school:    'School',
    corporate: 'Corporate',
    clinic:    'Clinic',
    ngo:       'NGO',
    coaching:  'Coaching',
    rehab:     'Rehab',
  };
  return map[type] || type;
}

function filterItems(items, typeTab) {
  if (typeTab === 'all') return items;
  if (typeTab === 'university') return items.filter(i => i.discovery_source === 'Universities');
  if (typeTab === 'school')     return items.filter(i => i.type === 'school' && i.discovery_source !== 'Universities');
  if (typeTab === 'corporate')  return items.filter(i => i.type === 'corporate');
  if (typeTab === 'clinic')     return items.filter(i => i.type === 'clinic');
  if (typeTab === 'ngo')        return items.filter(i => i.type === 'ngo');
  return items.filter(i => !['school','corporate','clinic','ngo'].includes(i.type) && i.discovery_source !== 'Universities');
}

export default function LeadRadar() {
  const [statusTab, setStatusTab]   = useState('pending');
  const [typeTab,   setTypeTab]     = useState('all');
  const [items,     setItems]       = useState([]);
  const [total,     setTotal]       = useState(0);
  const [loading,   setLoading]     = useState(false);
  const [scanning,  setScanning]    = useState(false);
  const [scanMsg,   setScanMsg]     = useState('');
  const [error,     setError]       = useState('');
  const [approving, setApproving]   = useState({});
  const [rejecting, setRejecting]   = useState({});
  const [stats,     setStats]       = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [page,      setPage]        = useState(1);
  const LIMIT = 50;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${API}?status=${statusTab}&limit=${LIMIT}&page=${page}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setItems(d.items || []);
      setTotal(d.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [statusTab, page]);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(`${API}/stats`);
      const d = await r.json();
      setStats(d);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => {
    fetchItems();
    fetchStats();
  }, [fetchItems, fetchStats]);

  useEffect(() => { setPage(1); }, [statusTab, typeTab]);

  async function triggerScan() {
    setScanning(true);
    setScanMsg('');
    try {
      const r = await fetch(`${API}/trigger`, { method: 'POST' });
      const d = await r.json();
      setScanMsg(d.message || 'Scan started — check back in a minute');
      setTimeout(() => { fetchItems(); fetchStats(); }, 8000);
    } catch (e) {
      setScanMsg('Error: ' + e.message);
    } finally {
      setScanning(false);
    }
  }

  async function approve(id) {
    setApproving(a => ({ ...a, [id]: true }));
    try {
      const r = await fetch(`${API}/approve/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: 'S', approver_name: 'Team' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setItems(prev => prev.filter(i => i._id !== id));
      setTotal(t => t - 1);
      fetchStats();
    } catch (e) {
      alert('Approve failed: ' + e.message);
    } finally {
      setApproving(a => ({ ...a, [id]: false }));
    }
  }

  async function reject(id) {
    setRejecting(r => ({ ...r, [id]: true }));
    try {
      const res = await fetch(`${API}/reject/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: '' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setItems(prev => prev.filter(i => i._id !== id));
      setTotal(t => t - 1);
      fetchStats();
    } catch (e) {
      alert('Reject failed: ' + e.message);
    } finally {
      setRejecting(r => ({ ...r, [id]: false }));
    }
  }

  const filtered = filterItems(items, typeTab);

  const tabCounts = {
    all:        items.length,
    university: items.filter(i => i.discovery_source === 'Universities').length,
    school:     items.filter(i => i.type === 'school' && i.discovery_source !== 'Universities').length,
    corporate:  items.filter(i => i.type === 'corporate').length,
    clinic:     items.filter(i => i.type === 'clinic').length,
    ngo:        items.filter(i => i.type === 'ngo').length,
    other:      items.filter(i => !['school','corporate','clinic','ngo'].includes(i.type) && i.discovery_source !== 'Universities').length,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Radar</h1>
          <p className="text-sm text-gray-500 mt-1">AI-discovered leads awaiting review</p>
        </div>
        <div className="flex gap-3 items-center">
          {stats && (
            <div className="flex gap-2 text-sm">
              <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full font-medium">
                {stats.pending} pending
              </span>
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full font-medium">
                {stats.approved} approved
              </span>
            </div>
          )}
          <button
            onClick={triggerScan}
            disabled={scanning}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {scanning ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Scanning…
              </>
            ) : <>⚡ Run Scan</>}
          </button>
          <button
            onClick={fetchItems}
            disabled={loading}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? '…' : '↺ Refresh'}
          </button>
        </div>
      </div>

      {scanMsg && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          {scanMsg}
        </div>
      )}

      {/* Status Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setStatusTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              statusTab === t.key
                ? 'bg-white border border-b-white border-gray-200 text-indigo-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Type Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {TYPE_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTypeTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              typeTab === t.key
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
            }`}
          >
            {t.label}
            {tabCounts[t.key] > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                typeTab === t.key ? 'bg-indigo-500' : 'bg-gray-100 text-gray-500'
              }`}>
                {tabCounts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* Results header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">
          Showing <strong>{filtered.length}</strong> of <strong>{total}</strong> {statusTab} leads
          {typeTab !== 'all' && ` · filtered by ${TYPE_TABS.find(t => t.key === typeTab)?.label}`}
        </p>
        {total > LIMIT && (
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setPage(p => Math.max(1, p-1))}
              disabled={page === 1}
              className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-gray-50"
            >‹</button>
            <span className="text-gray-600">Page {page}</span>
            <button
              onClick={() => setPage(p => p+1)}
              disabled={page * LIMIT >= total}
              className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-gray-50"
            >›</button>
          </div>
        )}
      </div>

      {/* Lead Cards */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <svg className="animate-spin h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Loading leads…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">📭</div>
          <p className="text-lg font-medium">No {statusTab} leads</p>
          <p className="text-sm mt-1">
            {statusTab === 'pending' ? 'Run a scan to discover new leads' : `No ${statusTab} leads in this category`}
          </p>
          {statusTab === 'pending' && (
            <button
              onClick={triggerScan}
              disabled={scanning}
              className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-medium"
            >
              ⚡ Run Scan Now
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <div
              key={item._id}
              className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden"
            >
              {/* Main row */}
              <div className="flex items-start gap-4 p-4">
                {/* Score */}
                <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold ${scoreColor(item.ai_score)}`}>
                  {item.ai_score}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-base">{item.org_name}</h3>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${typeBadge(item.type, item.discovery_source)}`}>
                      {typeLabel(item.type, item.discovery_source)}
                    </span>
                    {/* Source platform badge — clickable link if real URL */}
                    <PlatformBadge url={item.source_url} notes={item.notes} />
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
                    {(item.city || item.state) && (
                      <span>📍 {[item.city, item.state].filter(Boolean).join(', ')}</span>
                    )}
                    {item.target_role && (
                      <span>👤 {item.target_role}</span>
                    )}
                    {item.job_title_hiring_for && (
                      <span>💼 Hiring: {item.job_title_hiring_for}</span>
                    )}
                    {item.employees_or_students > 0 && (
                      <span>👥 {item.employees_or_students.toLocaleString()}</span>
                    )}
                  </div>
                  {item.notes && (
                    <p className="mt-1.5 text-sm text-gray-600 line-clamp-2">{item.notes.replace(/\[Posted on [^\]]+\]\s*/, '')}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex-shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => setExpandedId(expandedId === item._id ? null : item._id)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    title="Details"
                  >
                    <svg className={`w-4 h-4 transition-transform ${expandedId === item._id ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {statusTab === 'pending' && (
                    <>
                      <button
                        onClick={() => approve(item._id)}
                        disabled={approving[item._id]}
                        className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                      >
                        {approving[item._id] ? '…' : '✓ Approve'}
                      </button>
                      <button
                        onClick={() => reject(item._id)}
                        disabled={rejecting[item._id]}
                        className="bg-white hover:bg-red-50 border border-red-300 text-red-600 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                      >
                        {rejecting[item._id] ? '…' : '✕ Reject'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {expandedId === item._id && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">Posted On</span>
                    {item.source_url && !item.source_url.includes('google.com') ? (
                      <a href={item.source_url} target="_blank" rel="noopener noreferrer"
                        className="block font-medium text-indigo-600 hover:text-indigo-800 mt-0.5 truncate">
                        {parsePlatform(item.source_url, item.notes) || item.source_url}
                      </a>
                    ) : (
                      <p className="font-medium text-gray-500 mt-0.5">
                        {parsePlatform(item.source_url, item.notes) || 'Not specified'}
                      </p>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">Signal Type</span>
                    <p className="font-medium text-gray-700 mt-0.5">{item.discovery_source || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">Hiring For</span>
                    <p className="font-medium text-gray-700 mt-0.5">{item.job_title_hiring_for || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">Target Role</span>
                    <p className="font-medium text-gray-700 mt-0.5">{item.target_role || '—'}</p>
                  </div>
                  {item.email && (
                    <div>
                      <span className="text-gray-400 text-xs uppercase tracking-wide">Email</span>
                      <p className="font-medium text-gray-700 mt-0.5">{item.email}</p>
                    </div>
                  )}
                  {item.phone && (
                    <div>
                      <span className="text-gray-400 text-xs uppercase tracking-wide">Phone</span>
                      <p className="font-medium text-gray-700 mt-0.5">{item.phone}</p>
                    </div>
                  )}
                  {item.contact_name && (
                    <div>
                      <span className="text-gray-400 text-xs uppercase tracking-wide">Contact</span>
                      <p className="font-medium text-gray-700 mt-0.5">{item.contact_name}</p>
                    </div>
                  )}
                  <div className="col-span-2 md:col-span-3">
                    <span className="text-gray-400 text-xs uppercase tracking-wide">Discovery Query</span>
                    <p className="font-medium text-gray-600 mt-0.5 text-xs break-all">{item.discovery_query || '—'}</p>
                  </div>
                  {item.source_url && !item.source_url.includes('google.com') && (
                    <div className="col-span-2 md:col-span-3">
                      <span className="text-gray-400 text-xs uppercase tracking-wide">Source URL</span>
                      <a href={item.source_url} target="_blank" rel="noopener noreferrer"
                        className="block font-medium text-indigo-600 hover:text-indigo-800 mt-0.5 text-xs break-all">
                        {item.source_url}
                      </a>
                    </div>
                  )}
                  {item.created_at && (
                    <div>
                      <span className="text-gray-400 text-xs uppercase tracking-wide">Discovered</span>
                      <p className="font-medium text-gray-700 mt-0.5">
                        {new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
