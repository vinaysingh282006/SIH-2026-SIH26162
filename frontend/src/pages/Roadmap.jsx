/**
 * Roadmap — Future development plan with animated timeline
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Roadmap.css';

const PHASES = [
  {
    phase: 'Phase 1',
    label: 'Foundation',
    period: 'Completed · Sept 2026',
    status: 'done',
    color: 'var(--green)',
    icon: '✓',
    items: [
      'Statistical anomaly detection (Z-score, IQR, frozen, RoC)',
      'Isolation Forest per-station models',
      'Cross-sensor physical consistency checks',
      'Spatial IDW neighbour deviation check',
      'Ensemble fusion with Platt calibration',
      'FastAPI backend with WebSocket live feed',
      'React dashboard with live map and anomaly feed',
      'Bootstrap 24h synthetic history on startup',
    ],
  },
  {
    phase: 'Phase 2',
    label: 'Deep Learning',
    period: 'Q4 2026',
    status: 'current',
    color: 'var(--cyan)',
    icon: '◉',
    items: [
      'LSTM-Autoencoder training on 1-year of real IMD data',
      'Full SHAP/LIME explainability pipeline',
      'Confidence calibration with isotonic regression',
      'Root-cause classification neural network',
      'Predictive maintenance degradation model',
      'Self-healing imputation with confidence intervals',
      'Alert dispatcher: email, SMS, webhook integration',
    ],
  },
  {
    phase: 'Phase 3',
    label: 'Scale & Harden',
    period: 'Q1 2027',
    status: 'planned',
    color: 'var(--violet-bright)',
    icon: '⬦',
    items: [
      'TimescaleDB + Redis Pub/Sub (replace in-memory state)',
      'Multi-region AWS network support (500+ stations)',
      'Horizontal scaling with stateless detection workers',
      'Concept drift detection and automatic model retraining',
      'Role-based access control (Admin / Operator / Viewer)',
      'Compliance logging and audit trails',
      'gRPC ingestion gateway for high-throughput streams',
    ],
  },
  {
    phase: 'Phase 4',
    label: 'Edge Intelligence',
    period: 'Q2 2027',
    status: 'planned',
    color: 'var(--teal)',
    icon: '⬡',
    items: [
      'TensorFlow Lite model export for ESP32 deployment',
      'On-device pre-screening (sub-mW inference)',
      'Selective transmission (only anomalous readings uplinked)',
      'OTA model update via MQTT',
      'Battery life optimization through adaptive sampling',
      'Solar-harvesting sensor node reference design',
    ],
  },
  {
    phase: 'Phase 5',
    label: 'Forecast Intelligence',
    period: 'Q3 2027',
    status: 'vision',
    color: 'var(--amber)',
    icon: '★',
    items: [
      'Nowcasting: 1-6h weather forecast from AWS network',
      'Anomaly-corrected NWP input data for models',
      'Automated dissemination to downstream forecast systems',
      'Extreme weather early warning module',
      'Integration with IMDPS and NCMRWF',
      'Open API for third-party meteorology applications',
      'Digital twin of full India AWS network',
    ],
  },
];

const FUTURE_FEATURES = [
  { icon: '🛸', title: 'Federated Learning', desc: 'Train global anomaly models across all stations without centralizing data', color: 'var(--cyan)' },
  { icon: '🌐', title: 'Multi-Sensor Fusion', desc: 'Incorporate radar, satellite, and lightning sensor data into ensemble', color: 'var(--violet-bright)' },
  { icon: '🎯', title: 'Causal Inference', desc: 'Move beyond correlation — identify WHY sensors fail with causal graphs', color: 'var(--teal)' },
  { icon: '📱', title: 'Mobile Command Center', desc: 'iOS/Android app for field engineers with AR sensor overlay', color: 'var(--amber)' },
  { icon: '🔊', title: 'Voice Alerts', desc: 'AI-narrated critical alerts with natural language briefings', color: 'var(--green)' },
  { icon: '🤝', title: 'Open Standard', desc: 'Publish anomaly detection API as open IMD standard for all NWPs', color: 'var(--cyan)' },
];

function ScrollRevealItem({ children, delay = 0 }) {
  return (
    <div className="reveal-item" style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export default function Roadmap() {
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in-view');
          observer.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal-item').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  });

  return (
    <div className="page roadmap-page">
      {/* Hero */}
      <div className="roadmap-hero">
        <div className="roadmap-hero-bg" />
        <span className="section-tag">Future Vision</span>
        <h1 className="roadmap-title">
          The Road to a <br />
          <span className="roadmap-accent">Self-Aware India</span>
        </h1>
        <p className="roadmap-sub">
          SkyGuard AI is just the beginning. Here's what we're building toward — a fully autonomous,
          self-healing weather observation network for the entire nation.
        </p>
        <div className="roadmap-quick-stats">
          <div className="rqs-item">
            <span className="rqs-num font-data">5</span>
            <span className="rqs-label">Development Phases</span>
          </div>
          <div className="rqs-sep" />
          <div className="rqs-item">
            <span className="rqs-num font-data">1000+</span>
            <span className="rqs-label">Target AWS Stations</span>
          </div>
          <div className="rqs-sep" />
          <div className="rqs-item">
            <span className="rqs-num font-data">2027</span>
            <span className="rqs-label">Full Deployment Target</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="roadmap-timeline">
        <div className="timeline-spine" />

        {PHASES.map((phase, i) => (
          <ScrollRevealItem key={phase.phase} delay={i * 100}>
            <div className={`timeline-item${i % 2 === 1 ? ' right' : ''}`}
              style={{ '--phase-color': phase.color }}>

              {/* Connector dot */}
              <div className="timeline-dot">
                <span className="timeline-dot-icon">{phase.icon}</span>
              </div>

              <div className="timeline-card">
                <div className="tc-header">
                  <div className="tc-phase-tag font-data">{phase.phase}</div>
                  <span className={`tc-status status-${phase.status}`}>
                    {phase.status === 'done' ? '✓ Complete' :
                     phase.status === 'current' ? '● In Progress' :
                     phase.status === 'planned' ? '◎ Planned' : '★ Vision'}
                  </span>
                </div>

                <h3 className="tc-title">{phase.label}</h3>
                <p className="tc-period">{phase.period}</p>

                <ul className="tc-items">
                  {phase.items.map((item, j) => (
                    <li key={j} className="tc-item">
                      <span className="tc-item-dot" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </ScrollRevealItem>
        ))}
      </div>

      {/* Future features grid */}
      <section className="future-section">
        <div className="reveal-item">
          <span className="section-tag">Long-Term Vision</span>
          <h2 className="section-title-roadmap">Moonshot Features</h2>
          <p className="section-sub-roadmap">The bold ideas that will define the next decade of weather intelligence in India</p>
        </div>
        <div className="future-grid">
          {FUTURE_FEATURES.map((f, i) => (
            <ScrollRevealItem key={f.title} delay={i * 80}>
              <div className="future-card" style={{ '--f-color': f.color }}>
                <span className="f-icon">{f.icon}</span>
                <h4 className="f-title">{f.title}</h4>
                <p className="f-desc">{f.desc}</p>
              </div>
            </ScrollRevealItem>
          ))}
        </div>
      </section>

      {/* Impact projection */}
      <section className="impact-section reveal-item">
        <div className="impact-inner">
          <span className="section-tag">Impact Projection</span>
          <h2 className="section-title-roadmap">Why This Matters</h2>
          <div className="impact-grid">
            {[
              { num: '900+', label: 'AWS Stations in India Currently', sub: 'all need anomaly monitoring', color: 'var(--cyan)' },
              { num: '30%', label: 'Sensor Data Currently Unreliable', sub: 'estimated industry figure', color: 'var(--amber)' },
              { num: '₹1000Cr', label: 'Economic Impact of Bad Forecasts', sub: 'annually across sectors', color: 'var(--red)' },
              { num: '100%', label: 'Improvement in Data Trustworthiness', sub: 'SkyGuard AI target', color: 'var(--green)' },
            ].map(item => (
              <div key={item.label} className="impact-tile" style={{ '--ic': item.color }}>
                <span className="impact-num font-data">{item.num}</span>
                <span className="impact-label">{item.label}</span>
                <span className="impact-sub">{item.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="roadmap-cta reveal-item">
        <h2>Start Exploring Now</h2>
        <p>The Phase 1 system is live. Explore the dashboard, trigger the demo, or dive into the anomaly feed.</p>
        <div className="roadmap-cta-btns">
          <Link to="/" className="btn btn-primary">← Back to Home</Link>
          <Link to="/map" className="btn btn-ghost">Open Live Map</Link>
          <Link to="/demo" className="btn btn-ghost">◐ Demo Mode</Link>
        </div>
      </div>
    </div>
  );
}
