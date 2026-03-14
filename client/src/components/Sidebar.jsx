import { NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';

const NAV = [
  { to: '/',              icon: '📊', label: 'Dashboard' },
  { to: '/radar',         icon: '📡', label: 'Lead Radar' },
  { to: '/hub',           icon: '🗂️',  label: 'Lead Hub' },
  { to: '/pipeline',      icon: '🔄', label: 'Pipeline' },
  { to: '/compose',       icon: '✍️',  label: 'AI Composer' },
  { to: '/followups',     icon: '🔔', label: 'Follow-ups' },
  { to: '/system-health', icon: '🛡️',  label: 'System Health', healthCheck: true },
];

export default function Sidebar() {
  const [systemOk, setSystemOk] = useState(null);

  useEffect(() => {
    async function check() {
      try {
        const r = await fetch('/api/health');
        const d = await r.json();
        setSystemOk(d.status === 'ok');
      } catch { setSystemOk(false); }
    }
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col min-h-screen">
      {/* Logo */}
      <div className="p-5 border-b border-gray-100">
        <h1 className="text-lg font-bold text-indigo-700">Cittaa</h1>
        <p className="text-xs text-gray-400 mt-0.5">SalesPulse</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(({ to, icon, label, healthCheck }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            <span className="flex-1">{label}</span>
            {healthCheck && (
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                systemOk === null ? 'bg-gray-300' :
                systemOk ? 'bg-green-500' : 'bg-red-500 animate-pulse'
              }`} />
            )}
          </NavLink>
        ))}
      </nav>

      {/* System status footer */}
      <div className="p-3 border-t border-gray-100">
        <NavLink to="/system-health" className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-gray-50 transition-colors">
          <span className={`w-2 h-2 rounded-full ${
            systemOk === null ? 'bg-gray-300' :
            systemOk ? 'bg-green-500' : 'bg-red-500 animate-pulse'
          }`} />
          <span>{systemOk === null ? 'Checking…' : systemOk ? 'All systems healthy' : '⚠️ System issue'}</span>
        </NavLink>
      </div>
    </aside>
  );
}
