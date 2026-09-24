/**
 * AnimatedBackground — Isobar/atmospheric flow animation
 * Slow-moving pressure-contour lines at ~5-10% opacity.
 * CSS/SVG only, performant, pauses under prefers-reduced-motion.
 */
import './AnimatedBackground.css';

export default function AnimatedBackground({ intensity = 1 }) {
  return (
    <div className="animated-bg" aria-hidden="true">
      <svg className="isobar-svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="blur-soft">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        {/* Slow-drifting contour lines */}
        <g filter="url(#blur-soft)" opacity="0.07">
          <path className="isobar isobar-1" d="M-100,200 Q300,150 600,220 Q900,290 1300,180" />
          <path className="isobar isobar-2" d="M-100,350 Q200,310 500,380 Q800,450 1300,330" />
          <path className="isobar isobar-3" d="M-100,500 Q250,470 550,540 Q850,610 1300,490" />
          <path className="isobar isobar-4" d="M-100,120 Q400,80 700,140 Q1000,200 1300,110" />
          <path className="isobar isobar-5" d="M-100,620 Q350,590 650,650 Q950,710 1300,600" />
          <path className="isobar isobar-6" d="M-100,430 Q280,400 580,460 Q880,520 1300,410" />
        </g>

        {/* Slow cloud-like violet shapes */}
        <g opacity="0.04">
          <ellipse className="cloud cloud-1" cx="300" cy="300" rx="280" ry="120" fill="#7A2436" />
          <ellipse className="cloud cloud-2" cx="900" cy="500" rx="320" ry="140" fill="#2A1A38" />
          <ellipse className="cloud cloud-3" cx="600" cy="180" rx="240" ry="100" fill="#5C7A5E" />
        </g>
      </svg>
    </div>
  );
}
