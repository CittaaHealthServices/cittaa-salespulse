import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, KanbanSquare, Sparkles,
  Bell, Radar,
} from 'lucide-react';

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leads', icon: Users, label: 'Lead Hub' },
  { to: '/pipeline', icon: KanbanSquare, label: 'Pipeline' },
  { to: '/compose', icon: Sparkles, label: 'AI Composer' },
  { to: '/followups', icon: Bell, label: 'Follow-ups' },
  { to: '/radar', icon: Radar, label: 'Lead Radar' },
];

export default function Sidebar() {
  return (
    <aside
      className="sidebar"
      style={{
        background: 'var(--sidebar-bg)',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 0 20px',
      }}
    >
      {/* Logo */}
      <div style={{ padding: '0 20px 28px' }}>
        <span
          className="font-logo"
          style={{ color: 'var(--purple)', fontSize: '1.65rem', letterSpacing: 0.5 }}
        >
          Cittaa
        </span>
        <div
          style={{
            fontSize: '0.7rem',
            color: 'var(--teal)',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginTop: 1,
          }}
        >
          SalesPulse
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 9,
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              transition: 'all 0.15s',
              color: isActive ? 'white' : 'rgba(255,255,255,0.55)',
              background: isActive ? 'rgba(139,90,150,0.25)' : 'transparent',
              position: 'relative',
            })}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 3,
                      height: 20,
                      background: 'var(--teal)',
                      borderRadius: '0 3px 3px 0',
                    }}
                  />
                )}
                <Icon size={17} strokeWidth={isActive ? 2.2 : 1.7} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div style={{ padding: '16px 20px 0', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 8 }}>
        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.55)', marginBottom: 2 }}>Cittaa Health</div>
          Hyderabad, India
        </div>
      </div>
    </aside>
  );
}
