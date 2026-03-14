import { useState, useEffect, useCallback } from 'react';

const APP_URL = 'https://cittaa-salespulse-production.up.railway.app';

const FIX_STEPS = {
  mongodb: {
    label: 'MongoDB Database',
    icon: '🗄️',
    steps: [
      'Go to Railway → Your project → Variables tab',
      'Confirm MONGO_URI is set and correct',
      'Open MongoDB Atlas → Network Access → allow 0.0.0.0/0',
      'Check Atlas cluster is NOT paused (free tier pauses after inactivity)',
      'Redeploy on Railway to force reconnect',
    ],
  },
  gemini: {
    label: 'Gemini AI (Lead Discovery)',
    icon: '🤖',
    steps: [
      'Go to Railway → Variables → confirm GEMINI_API_KEY is set',
      'Check quota at aistudio.google.com',
      'Verify key belongs to the correct Google account',
      'If quota exceeded, wait until midnight Pacific Time for reset',
    ],
  },
  email: {
    label: 'Email Service (Resend)',
    icon: '📧',
    steps: [
      'Go to Railway → Variables → confirm RESEND_API_KEY is set',
      'Check resend.com dashboard for errors or quota issues',
      'Verify domain cittaa.in is verified in Resend',
      'Free tier allows 100 emails/day',
    ],
  },
  discovery: {
    label: 'Lead Discovery Engine',
    icon: '🔍',
    steps: [
      'Click "Run Scan" on the Lead Radar page',
      `Visit ${APP_URL}/api/radar/debug-scan for detailed diagnosis`,
      'Check Railway logs for [Discovery] ERROR messages',
      'Ensure both GEMINI_API_KEY and MONGO_URI are set',
    ],
  },
  server: {
    label: 'Server / App',
    icon: '🖥️',
    steps: [
      `Check ${APP_URL}/api/health — if it loads, app is running`,
      'Railway dashboard → Deployments → check for failed builds',
      'Railway → Logs → look for crash details',
      'Redeploy from Railway if latest deploy is red',
    ],
  },
};

function StatusDot({ ok, checking }) {
  if (checking) return <span className="w-3 h-3 rounded-full bg-gray-300 animate-pulse inline-block" />;
  if (ok === true)  return <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />;
  if (ok === false) return <span className="w-3 h-3 rounded-full bg-red-500 inline-block animate-pulse" />;
  return <span className="w-3 h-3 rounded-full bg-gray-300 inline-block" />;
}

function StatusBadge({ ok, checking }) {
  if (checking) return <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Checking…</span>;
  if (ok === true)  return <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Healthy</span>;
  if (ok === false) return <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">Down</span>;
  return <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Unknown</span>;
}

function timeAgo(iso) {
  if (!iso) return '—';
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs/3600)}h ago`;
  return `${Math.floor(secs/86400)}d ago`;
}

function ComponentCard({ key: _k, name, data, monitorStatus, onRunScan, runningAction }) {
  const [expanded, setExpanded] = useState(false);
  const info     = FIX_STEPS[name] || {};
  const isDown   = monitorStatus === false;
  const isHealthy = monitorStatus === true;

  return (
    <div className={`bg-white rounded-xl border ${isDown ? 'border-red-300 shadow-sm shadow-red-100' : 'border-gray-200'} overflow-hidden`}>
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">{info.icon || '⚙️'}</span>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{info.label || name}</p>
            {data?.error && <p className="text-xs text-red-600 mt-0.5 max-w-xs truncate">{data.error}</p>}
            {data?.warning && <p className="text-xs text-yellow-600 mt-0.5">{data.warning}</p>}
            {name === 'discovery' && data?.lastRan && (
              <p className="text-xs text-gray-400 mt-0.5">Last scan: {timeAgo(data.lastRan)} · {data.leadsFound || 0} leads</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge ok={monitorStatus} />
          {isDown && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3 py-1 rounded-lg font-medium transition-colors"
            >
              {expanded ? 'Hide Fix' : '🔧 Fix'}
            </button>
          )}
          {name === 'discovery' && isHealthy && (
            <button
              onClick={onRunScan}
              disabled={runningAction}
              className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {runningAction ? '⏳ Scanning…' : '⚡ Run Scan'}
            </button>
          )}
        </div>
      </div>

      {expanded && isDown && (
        <div className="border-t border-red-100 bg-red-50 px-4 py-3">
          <p className="text-xs font-semibold text-red-700 mb-2 uppercase tracking-wide">Fix steps:</p>
          <ol className="space-y-1.5">
            {(info.steps || []).map((step, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="text-red-400 font-bold flex-shrink-0">{i+1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function SystemHealth() {
  const [health,  setHealth]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [lastChecked, setLastChecked] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [runningAction, setRunningAction] = useState('');

  const fetch_ = useCallback(async () => {
    try {
      const r = await fetch('/api/healthcheck');
      const d = await r.json();
      setHealth(d);
      setLastChecked(new Date());
      setError('');
    } catch(e) {
      setError('Cannot reach server: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetch_, 30000);
    return () => clearInterval(id);
  }, [autoRefresh, fetch_]);

  async function runScan() {
    setRunningAction('scan');
    try {
      await fetch('/api/radar/trigger', { method: 'POST' });
      setTimeout(fetch_, 6000);
    } catch(e) {}
    finally { setRunningAction(''); }
  }

  // Derive component statuses
  const monStatus = health?.monitor?.component_status || {};
  const components = [
    { name: 'mongodb',   data: health?.database },
    { name: 'gemini',    data: { ok: health?.env?.GEMINI_API_KEY, error: !health?.env?.GEMINI_API_KEY ? 'GEMINI_API_KEY not set' : null } },
    { name: 'email',     data: { ok: health?.services?.email, error: !health?.services?.email ? 'RESEND_API_KEY not set' : null } },
    { name: 'discovery', data: { lastRan: health?.discovery?.last_run, leadsFound: health?.discovery?.last_leads_found } },
  ];

  // Overall status
  const allOk  = health?.ok;
  const anyDown = components.some(c => monStatus[c.name] === false);
  const overallStatus = loading ? 'loading' : anyDown ? 'down' : allOk ? 'healthy' : 'warning';

  const statusConfig = {
    loading: { bg: 'bg-gray-50 border-gray-200', text: 'Checking system…',      dot: 'bg-gray-400', label: 'Checking' },
    healthy: { bg: 'bg-green-50 border-green-200', text: 'All systems healthy',  dot: 'bg-green-500', label: 'All Systems Go' },
    warning: { bg: 'bg-yellow-50 border-yellow-200', text: 'Some services missing', dot: 'bg-yellow-500', label: 'Needs Attention' },
    down:    { bg: 'bg-red-50 border-red-300', text: 'One or more services are down — check below', dot: 'bg-red-500 animate-pulse', label: 'Service Down' },
  };
  const sc = statusConfig[overallStatus];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time status · auto-refreshes every 30s
            {lastChecked && <> · Last checked: {timeAgo(lastChecked.toISOString())}</>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <div
              onClick={() => setAutoRefresh(v => !v)}
              className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${autoRefresh ? 'bg-indigo-600' : 'bg-gray-300'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${autoRefresh ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            Auto-refresh
          </label>
          <button
            onClick={fetch_}
            disabled={loading}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? '…' : '↺ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* Overall status banner */}
      <div className={`border rounded-xl p-4 mb-6 flex items-center gap-3 ${sc.bg}`}>
        <span className={`w-4 h-4 rounded-full flex-shrink-0 ${sc.dot}`} />
        <div>
          <p className="font-semibold text-gray-900">{sc.label}</p>
          <p className="text-sm text-gray-600">{sc.text}</p>
        </div>
        {overallStatus === 'down' && (
          <div className="ml-auto text-sm text-red-600 font-medium">
            📧 Alert email sent to team
          </div>
        )}
      </div>

      {/* Component cards */}
      <div className="space-y-3 mb-8">
        {components.map(c => (
          <ComponentCard
            key={c.name}
            name={c.name}
            data={c.data}
            monitorStatus={monStatus[c.name] ?? (
              c.name === 'mongodb'   ? (health?.database?.connected ?? null) :
              c.name === 'gemini'    ? (health?.env?.GEMINI_API_KEY ?? null) :
              c.name === 'email'     ? (health?.services?.email ?? null) :
              null
            )}
            onRunScan={runScan}
            runningAction={runningAction === 'scan'}
          />
        ))}
      </div>

      {/* Stats row */}
      {health && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Uptime',       value: (() => { const s = health.uptime_secs || 0; const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); return h > 0 ? `${h}h ${m}m` : `${m}m`; })() },
            { label: 'Leads in DB',  value: (health.database?.leads || 0).toLocaleString() },
            { label: 'Queue (Pending)', value: (health.database?.queue?.pending || 0).toLocaleString() },
            { label: 'Response',     value: `${health.latency_ms || 0}ms` },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Env vars */}
      {health?.env && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3 text-sm uppercase tracking-wide">Environment Variables</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(health.env).filter(([k]) => !['NODE_ENV','PORT'].includes(k)).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${v ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-gray-700 font-mono text-xs">{k}</span>
                <span className={`ml-auto text-xs ${v ? 'text-green-600' : 'text-red-600'}`}>{v ? 'Set ✓' : 'Missing!'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Errors */}
      {health?.monitor?.recent_errors?.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="font-semibold text-gray-900 mb-3 text-sm uppercase tracking-wide">Recent Errors</h2>
          <div className="space-y-2">
            {health.monitor.recent_errors.map((e, i) => (
              <div key={i} className="flex items-start gap-3 text-sm p-2 bg-red-50 rounded-lg border border-red-100">
                <span className="text-red-400 font-bold text-xs mt-0.5 uppercase flex-shrink-0">{e.component}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800 text-xs truncate">{e.message}</p>
                </div>
                <span className="text-gray-400 text-xs flex-shrink-0">{timeAgo(e.time)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discovery info */}
      {health?.discovery && (
        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="font-semibold text-gray-900 mb-3 text-sm uppercase tracking-wide">Lead Discovery</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs">Total queries</p>
              <p className="font-semibold mt-0.5">{health.discovery.queries}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Last scan</p>
              <p className="font-semibold mt-0.5">{timeAgo(health.discovery.last_run)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Leads last scan</p>
              <p className="font-semibold mt-0.5">{health.discovery.last_leads_found || 0}</p>
            </div>
          </div>
          {health.discovery.platforms?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {health.discovery.platforms.map(p => (
                <span key={p} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{p}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
