/**
 * Sidebar — persistent left navigation
 * Collapses to bottom nav on mobile.
 */
import { NavLink, useLocation } from 'react-router-dom';
import './Sidebar.css';

const NAV_ITEMS = [
  { path: '/',          label: 'Mission',      icon: '◈' },
  { path: '/map',       label: 'Live Map',     icon: '◉' },
  { path: '/anomalies', label: 'Anomaly Feed', icon: '⚡' },
  { path: '/health',    label: 'Sensor Health',icon: '♥' },
  { path: '/analytics', label: 'Analytics',   icon: '▦' },
  { path: '/settings',  label: 'Settings',    icon: '⚙' },
  { path: '/demo',      label: 'Demo Mode',   icon: '◐', demo: true },
];

export default function Sidebar({ anomalyCount = 0 }) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sidebar" role="navigation" aria-label="Main navigation">
        <div className="sidebar-logo">
          <span className="logo-icon">⟁</span>
          <div className="logo-text">
            <span className="logo-title">SkyGuard</span>
            <span className="logo-sub">AI · SIH 2026</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `sidebar-link${isActive ? ' active' : ''}${item.demo ? ' demo-link' : ''}`
              }
            >
              <span className="link-icon">{item.icon}</span>
              <span className="link-label">{item.label}</span>
              {item.path === '/anomalies' && anomalyCount > 0 && (
                <span className="badge-count">{anomalyCount > 99 ? '99+' : anomalyCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="live-indicator">
            <span className="live-dot" />
            Live
          </div>
          <span className="text-muted text-xs">IMD · AWS Network</span>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav" role="navigation" aria-label="Mobile navigation">
        {NAV_ITEMS.slice(0, 5).map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `bottom-nav-link${isActive ? ' active' : ''}`}
          >
            <span>{item.icon}</span>
            <span>{item.label.split(' ')[0]}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
