/**
 * TopBar — sleek top navigation replacing sidebar
 */
import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import './TopBar.css';

const NAV_ITEMS = [
  { path: '/',          label: 'Home',         icon: '⬡' },
  { path: '/map',       label: 'Live Map',     icon: '◉' },
  { path: '/anomalies', label: 'Anomalies',    icon: '⚡' },
  { path: '/health',    label: 'Sensor Health',icon: '♡' },
  { path: '/analytics', label: 'Analytics',   icon: '▦' },
  { path: '/demo',      label: 'Demo Mode',   icon: '◐', demo: true },
  { path: '/roadmap',   label: 'Roadmap',     icon: '⬦' },
];

export default function TopBar({ anomalyCount = 0 }) {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <>
      <header className={`topbar${scrolled ? ' topbar-scrolled' : ''}`} role="banner">
        <div className="topbar-inner">
          {/* Logo */}
          <NavLink to="/" className="topbar-logo" aria-label="SkyGuard AI Home">
            <div className="logo-hexagon">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <polygon points="14,2 25,8 25,20 14,26 3,20 3,8" fill="none" stroke="var(--cyan)" strokeWidth="1.5"/>
                <polygon points="14,6 21,10 21,18 14,22 7,18 7,10" fill="var(--cyan-glow)" stroke="var(--cyan)" strokeWidth="0.8"/>
                <circle cx="14" cy="14" r="3" fill="var(--cyan)"/>
              </svg>
            </div>
            <div className="logo-text">
              <span className="logo-title">SkyGuard</span>
              <span className="logo-tag">AI</span>
            </div>
          </NavLink>

          {/* Center nav */}
          <nav className="topbar-nav" role="navigation" aria-label="Main navigation">
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `topbar-link${isActive ? ' active' : ''}${item.demo ? ' demo-link' : ''}`
                }
              >
                <span className="topbar-link-icon">{item.icon}</span>
                <span className="topbar-link-label">{item.label}</span>
                {item.path === '/anomalies' && anomalyCount > 0 && (
                  <span className="topbar-badge">{anomalyCount > 99 ? '99+' : anomalyCount}</span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Right section */}
          <div className="topbar-right">
            <div className="live-pill">
              <span className="live-dot breathe" />
              <span>LIVE</span>
            </div>
            <div className="topbar-network">
              <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>IMD · AWS</span>
            </div>

            {/* Mobile hamburger */}
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
            >
              <span className={`hamburger${mobileOpen ? ' open' : ''}`}>
                <span /><span /><span />
              </span>
            </button>
          </div>
        </div>

        {/* Scan line effect */}
        <div className="topbar-scanline" />
      </header>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileOpen(false)}>
          <nav className="mobile-nav" role="navigation" onClick={e => e.stopPropagation()}>
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `mobile-nav-link${isActive ? ' active' : ''}${item.demo ? ' demo' : ''}`
                }
              >
                <span className="mobile-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
                {item.path === '/anomalies' && anomalyCount > 0 && (
                  <span className="topbar-badge">{anomalyCount}</span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
