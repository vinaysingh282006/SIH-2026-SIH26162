/**
 * Landing — Cinematic homepage with step-by-step scroll reveal
 */
import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { fetchStations, fetchAnomalies } from '../api/client';
import './Landing.css';

/* ── Animated particle canvas ──────────────────────────────────── */
function ParticleField() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let W = canvas.width  = canvas.offsetWidth;
    let H = canvas.height = canvas.offsetHeight;

    const particles = Array.from({ length: 80 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.5 + 0.2,
    }));

    function draw() {
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 212, 255, ${p.alpha})`;
        ctx.fill();
      });
      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.12 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    }
    draw();

    const onResize = () => {
      W = canvas.width  = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize); };
  }, []);
  return <canvas ref={canvasRef} className="particle-canvas" />;
}

/* ── Animated counter ────────────────────────────────────────────── */
function Counter({ target, duration = 1200, suffix = '' }) {
  const [val, setVal] = useState(0);
  const started = useRef(false);
  const ref = useRef(null);

  useEffect(() => {
    if (target === 0) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const start = Date.now();
        const tick = () => {
          const progress = Math.min(1, (Date.now() - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          setVal(Math.round(eased * target));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return <span ref={ref}>{val}{suffix}</span>;
}

/* ── Pipeline node diagram ───────────────────────────────────────── */
function PipelineDiagram() {
  const nodes = [
    { id: 'sensors', label: 'AWS Sensors', icon: '📡', x: 10, y: 50, color: 'var(--cyan)' },
    { id: 'ingest',  label: 'Ingest',      icon: '⚡', x: 28, y: 50, color: 'var(--teal)' },
    { id: 'ensemble',label: 'AI Ensemble', icon: '🧠', x: 50, y: 50, color: 'var(--violet-bright)' },
    { id: 'fusion',  label: 'Fusion',      icon: '⚗️', x: 72, y: 50, color: 'var(--cyan)' },
    { id: 'dashboard',label:'Dashboard',   icon: '📊', x: 90, y: 50, color: 'var(--teal)' },
  ];
  const sub = [
    { label: 'Statistical', y: 25, parentX: 50 },
    { label: 'Isolation Forest', y: 75, parentX: 50 },
    { label: 'LSTM-AE', y: 50, parentX: 50 },
  ];
  return (
    <div className="pipeline-diagram">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pipeline-svg">
        {/* Main flow lines */}
        {nodes.slice(0, -1).map((n, i) => (
          <line key={i}
            x1={n.x + 4} y1={n.y} x2={nodes[i+1].x - 4} y2={nodes[i+1].y}
            stroke="var(--border-color-strong)" strokeWidth="0.4" strokeDasharray="1,1"
          />
        ))}
        {/* Animated flow */}
        {nodes.slice(0, -1).map((n, i) => (
          <line key={`anim-${i}`}
            x1={n.x + 4} y1={n.y} x2={nodes[i+1].x - 4} y2={nodes[i+1].y}
            stroke="var(--cyan)" strokeWidth="0.6" strokeDasharray="2,8"
            style={{ animation: `flowDash 2s linear ${i * 0.3}s infinite` }}
          />
        ))}
      </svg>
      <div className="pipeline-nodes">
        {nodes.map(n => (
          <div key={n.id} className="pipeline-node" style={{ left: `${n.x}%`, '--node-color': n.color }}>
            <div className="pnode-icon">{n.icon}</div>
            <div className="pnode-label">{n.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Scroll reveal hook ──────────────────────────────────────────── */
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('revealed');
          observer.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  });
}

const HOW_STEPS = [
  {
    step: '01',
    title: 'Real-Time Ingestion',
    desc: 'Sensors across the AWS network send temperature, pressure and humidity readings every 5 minutes via REST or MQTT.',
    icon: '📡',
    detail: ['20 stations monitored', '5-min reading interval', 'REST + WebSocket ingest'],
    color: 'var(--cyan)',
  },
  {
    step: '02',
    title: '5-Layer Ensemble',
    desc: 'Every reading passes through Statistical (Z-score, IQR, frozen), Isolation Forest, LSTM-Autoencoder, Cross-sensor, and Spatial consistency checks simultaneously.',
    icon: '🧠',
    detail: ['Statistical checks < 1ms', 'Isolation Forest < 5ms', 'LSTM-AE < 20ms'],
    color: 'var(--violet-bright)',
  },
  {
    step: '03',
    title: 'Confidence Fusion',
    desc: 'Layer scores are fused using calibrated Platt scaling into a unified 0–100% confidence score with severity classification.',
    icon: '⚗️',
    detail: ['Weighted fusion', 'Sigmoid calibration', 'Low → Critical severity'],
    color: 'var(--teal)',
  },
  {
    step: '04',
    title: 'Explainable Alerts',
    desc: 'Every anomaly ships with SHAP-style feature attribution bars and a plain-language reasoning sentence so operators understand why.',
    icon: '💡',
    detail: ['SHAP attribution bars', 'Root-cause classification', 'Natural language reason'],
    color: 'var(--amber)',
  },
  {
    step: '05',
    title: 'Self-Healing',
    desc: 'Corrected values are proposed using spatial IDW, seasonal-naive, and linear interpolation — always flagged as estimates with full audit trail.',
    icon: '🩺',
    detail: ['IDW imputation', 'Sensor health scoring', 'Predictive maintenance'],
    color: 'var(--green-bright)',
  },
];

const TECH_STACK = [
  { name: 'Python 3.14', cat: 'Runtime', color: 'var(--cyan)' },
  { name: 'FastAPI', cat: 'API', color: 'var(--teal)' },
  { name: 'PyTorch', cat: 'ML', color: 'var(--orange)' },
  { name: 'scikit-learn', cat: 'ML', color: 'var(--violet-bright)' },
  { name: 'React 19', cat: 'Frontend', color: 'var(--cyan)' },
  { name: 'Recharts', cat: 'Charts', color: 'var(--amber)' },
  { name: 'Leaflet', cat: 'Maps', color: 'var(--green-bright)' },
  { name: 'WebSockets', cat: 'Realtime', color: 'var(--teal)' },
];

export default function Landing() {
  const [stats, setStats] = useState({ stations: 0, anomalies: 0, healthy: 0 });
  useScrollReveal();

  useEffect(() => {
    async function load() {
      try {
        const [stations, anomalies] = await Promise.all([fetchStations(), fetchAnomalies({ limit: 200 })]);
        const healthy = stations.filter(s => s.status === 'healthy').length;
        setStats({ stations: stations.length, anomalies: anomalies.length, healthy });
      } catch { /* backend not ready */ }
    }
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="landing-page">

      {/* ════════════════════════════════════════════════════════════
          HERO SECTION
      ════════════════════════════════════════════════════════════ */}
      <section className="hero-section" aria-label="Hero">
        <ParticleField />

        <div className="hero-content">
          {/* Eyebrow */}
          <div className="hero-eyebrow fade-in">
            <span className="badge badge-cyan">SIH 2026 · Problem 26073</span>
            <span className="badge badge-low">Ministry of Earth Sciences · IMD</span>
          </div>

          {/* Headline */}
          <h1 className="hero-headline reveal">
            A Weather Network
            <br />
            That <span className="hero-accent">Knows</span> When
            <br />
            It's <span className="hero-accent-glow">Lying</span>
          </h1>

          <p className="hero-sub reveal">
            SkyGuard AI continuously monitors a network of Automatic Weather Stations —
            detecting sensor faults, explaining every alert, scoring its own confidence,
            and proposing corrected values in real time.
          </p>

          {/* CTA */}
          <div className="hero-cta reveal">
            <Link to="/map" className="btn btn-primary hero-btn-main">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
              Open Live Dashboard
            </Link>
            <Link to="/demo" className="btn btn-ghost hero-btn-ghost">
              ◐ Demo / Judge Mode
            </Link>
          </div>

          {/* Live stats */}
          <div className="hero-stats-row reveal">
            <div className="hero-stat">
              <span className="hero-stat-num font-data">
                <Counter target={stats.stations} />
              </span>
              <span className="hero-stat-label">Stations Online</span>
            </div>
            <div className="hero-stat-sep" />
            <div className="hero-stat">
              <span className="hero-stat-num font-data" style={{ color: 'var(--green-bright)' }}>
                <Counter target={stats.healthy} />
              </span>
              <span className="hero-stat-label">Healthy Now</span>
            </div>
            <div className="hero-stat-sep" />
            <div className="hero-stat">
              <span className="hero-stat-num font-data" style={{ color: 'var(--amber)' }}>
                <Counter target={stats.anomalies} />
              </span>
              <span className="hero-stat-label">Anomalies Caught</span>
            </div>
            <div className="hero-stat-sep" />
            <div className="hero-stat">
              <span className="hero-stat-num font-data" style={{ color: 'var(--cyan)' }}>
                &lt;50<span style={{ fontSize: '0.5em', color: 'var(--text-muted)' }}>ms</span>
              </span>
              <span className="hero-stat-label">Detection Latency</span>
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="scroll-hint">
          <span>Scroll to explore</span>
          <div className="scroll-chevron">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 7l5 5 5-5" stroke="var(--cyan)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          GRAND CHALLENGE
      ════════════════════════════════════════════════════════════ */}
      <section className="challenge-section reveal">
        <div className="challenge-label">Grand Challenge · SIH 26073</div>
        <blockquote className="challenge-quote">
          "Can AI build a <strong>self-aware</strong> and <strong>self-healing</strong> weather
          observation network capable of delivering <em>trustworthy</em> atmospheric data
          under all environmental conditions?"
        </blockquote>
        <div className="challenge-pillars">
          {[
            { icon: '◉', label: 'Self-Aware', desc: 'Confidence scoring + health degradation tracking', color: 'var(--cyan)' },
            { icon: '⟁', label: 'Self-Explaining', desc: 'SHAP attribution + natural-language reasoning', color: 'var(--violet-bright)' },
            { icon: '♡', label: 'Self-Healing', desc: 'Auto-imputation + predictive maintenance scheduling', color: 'var(--teal)' },
          ].map(p => (
            <div key={p.label} className="pillar-card" style={{ '--pillar-color': p.color }}>
              <span className="pillar-icon">{p.icon}</span>
              <strong className="pillar-title">{p.label}</strong>
              <p className="pillar-desc">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          HOW IT WORKS — STEP-BY-STEP REVEAL
      ════════════════════════════════════════════════════════════ */}
      <section className="how-section">
        <div className="how-header reveal">
          <span className="section-tag">Architecture</span>
          <h2 className="section-title">How SkyGuard Works</h2>
          <p className="section-sub">Five detection layers fused into one trustworthy anomaly score in under 50ms</p>
        </div>

        {/* Pipeline overview */}
        <div className="reveal">
          <PipelineDiagram />
        </div>

        {/* Steps */}
        <div className="how-steps">
          {HOW_STEPS.map((step, i) => (
            <div
              key={step.step}
              className={`how-step reveal${i % 2 === 1 ? ' how-step-reverse' : ''}`}
            >
              <div className="step-visual" style={{ '--step-color': step.color }}>
                <div className="step-number font-data">{step.step}</div>
                <div className="step-icon-wrap">
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-glow-ring" />
                </div>
                <div className="step-detail-list">
                  {step.detail.map(d => (
                    <div key={d} className="step-detail-item">
                      <span className="step-detail-dot" />
                      <span>{d}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="step-text">
                <h3 className="step-title" style={{ color: step.color }}>{step.title}</h3>
                <p className="step-desc">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          DETECTION LAYERS SHOWCASE
      ════════════════════════════════════════════════════════════ */}
      <section className="layers-section reveal">
        <div className="section-tag">Detection Ensemble</div>
        <h2 className="section-title">5 Layers. 1 Confident Score.</h2>
        <div className="layers-grid">
          {[
            { name: 'Statistical', weight: 35, color: 'var(--cyan)', desc: 'Z-score, IQR, frozen-value, rate-of-change' },
            { name: 'Isolation Forest', weight: 25, color: 'var(--violet-bright)', desc: 'Multivariate ML outlier on 3 sensors' },
            { name: 'LSTM-Autoencoder', weight: 20, color: 'var(--teal)', desc: 'Deep temporal reconstruction error' },
            { name: 'Cross-Sensor', weight: 15, color: 'var(--amber)', desc: 'Physical plausibility across T, P, H' },
            { name: 'Spatial', weight: 5, color: 'var(--orange)', desc: 'IDW neighbour deviation check' },
          ].map(layer => (
            <div key={layer.name} className="layer-card" style={{ '--layer-color': layer.color }}>
              <div className="layer-header">
                <span className="layer-name">{layer.name}</span>
                <span className="layer-weight font-data">{layer.weight}%</span>
              </div>
              <div className="layer-bar-track">
                <div
                  className="layer-bar-fill"
                  style={{ '--bar-width': `${layer.weight * 2.86}%` }}
                />
              </div>
              <p className="layer-desc">{layer.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          ANOMALY TYPES SHOWCASE
      ════════════════════════════════════════════════════════════ */}
      <section className="anomaly-types-section reveal">
        <span className="section-tag">Anomaly Types</span>
        <h2 className="section-title">What We Detect</h2>
        <div className="anomaly-types-grid">
          {[
            { type: 'Spike', icon: '⚡', desc: 'Sudden extreme value in one or more sensors', color: 'var(--red)' },
            { type: 'Frozen Value', icon: '🧊', desc: 'Sensor stuck reporting same reading for N cycles', color: 'var(--cyan)' },
            { type: 'Drift', icon: '📉', desc: 'Slow monotonic divergence from seasonal norm', color: 'var(--amber)' },
            { type: 'Comms Dropout', icon: '📡', desc: 'All sensors missing — network or power failure', color: 'var(--violet-bright)' },
            { type: 'Noise Burst', icon: '〰️', desc: 'High-frequency jitter from sensor hardware fault', color: 'var(--orange)' },
            { type: 'Cross-Sensor', icon: '🔗', desc: 'T/P/H readings physically inconsistent with each other', color: 'var(--teal)' },
          ].map(a => (
            <div key={a.type} className="anomaly-type-card" style={{ '--at-color': a.color }}>
              <span className="at-icon">{a.icon}</span>
              <span className="at-type">{a.type}</span>
              <p className="at-desc">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          TECH STACK
      ════════════════════════════════════════════════════════════ */}
      <section className="tech-section reveal">
        <span className="section-tag">Technology</span>
        <h2 className="section-title">Built With</h2>
        <div className="tech-grid">
          {TECH_STACK.map(t => (
            <div key={t.name} className="tech-chip" style={{ '--tc': t.color }}>
              <span className="tech-cat">{t.cat}</span>
              <span className="tech-name">{t.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          CTA FOOTER
      ════════════════════════════════════════════════════════════ */}
      <section className="cta-section reveal">
        <div className="cta-inner">
          <h2 className="cta-headline">Ready to explore?</h2>
          <p className="cta-sub">Open the live dashboard or run the judge demo to see anomaly detection in action.</p>
          <div className="cta-buttons">
            <Link to="/map" className="btn btn-primary">Open Live Map →</Link>
            <Link to="/demo" className="btn btn-ghost">◐ Demo Mode</Link>
            <Link to="/roadmap" className="btn btn-ghost">⬦ Future Roadmap</Link>
          </div>
        </div>
      </section>

    </div>
  );
}
