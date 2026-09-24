import React, { useMemo } from 'react';
import './AnimatedBackground.css';

/**
 * SkyGuard AI — Weather-Reactive Motion Background
 * =================================================
 * Lightweight CSS & SVG animated atmospheric layer.
 * Adapts to conditions: 'Clear', 'Rain', 'Clouds', 'Overcast', 'Snow', 'Thunderstorm', 'Fog'.
 * Respects `prefers-reduced-motion` with static graceful fallback.
 */

export default function AnimatedBackground({ condition = 'Clear' }) {
  const normCond = useMemo(() => {
    const c = (condition || '').toLowerCase();
    if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) return 'rain';
    if (c.includes('thunder') || c.includes('storm')) return 'thunderstorm';
    if (c.includes('snow') || c.includes('hail') || c.includes('ice') || c.includes('flurr')) return 'snow';
    if (c.includes('fog') || c.includes('mist') || c.includes('haze')) return 'fog';
    if (c.includes('cloud') || c.includes('overcast')) return 'clouds';
    return 'clear';
  }, [condition]);

  // Rain streaks setup (28 light streaks)
  const rainDrops = useMemo(() => {
    return Array.from({ length: 28 }, (_, i) => ({
      id: i,
      left: `${(i * 3.6 + Math.random() * 2).toFixed(1)}%`,
      delay: `${(Math.random() * 2).toFixed(2)}s`,
      duration: `${(0.7 + Math.random() * 0.5).toFixed(2)}s`,
      height: `${25 + Math.floor(Math.random() * 25)}px`,
      opacity: 0.25 + Math.random() * 0.35,
    }));
  }, []);

  // Snow flakes setup (24 flakes)
  const snowFlakes = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => ({
      id: i,
      left: `${(i * 4.2 + Math.random() * 2).toFixed(1)}%`,
      delay: `${(Math.random() * 4).toFixed(2)}s`,
      duration: `${(3 + Math.random() * 3).toFixed(2)}s`,
      size: `${3 + Math.floor(Math.random() * 4)}px`,
      opacity: 0.3 + Math.random() * 0.4,
    }));
  }, []);

  return (
    <div className={`animated-bg weather-bg-${normCond}`} aria-hidden="true">
      {/* Dynamic ambient aura */}
      <div className="bg-aura-glow" />

      {/* Atmospheric Isobars (Base meteorological contour lines) */}
      <svg className="isobar-svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="isobar-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.12" />
            <stop offset="50%" stopColor="#7C3AED" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#00FFC8" stopOpacity="0.12" />
          </linearGradient>
          <filter id="bg-soft-blur">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        <g className="isobar-group" filter="url(#bg-soft-blur)">
          <path className="isobar isobar-1" stroke="url(#isobar-grad)" d="M-100,180 Q300,130 600,200 Q900,270 1300,160" />
          <path className="isobar isobar-2" stroke="url(#isobar-grad)" d="M-100,320 Q200,280 500,350 Q800,420 1300,300" />
          <path className="isobar isobar-3" stroke="url(#isobar-grad)" d="M-100,480 Q250,440 550,510 Q850,580 1300,460" />
          <path className="isobar isobar-4" stroke="url(#isobar-grad)" d="M-100,640 Q350,600 650,670 Q950,730 1300,620" />
        </g>

        {/* Cloud masses for Cloudy/Overcast */}
        {(normCond === 'clouds' || normCond === 'thunderstorm' || normCond === 'rain') && (
          <g className="cloud-group">
            <ellipse className="cloud cloud-1" cx="250" cy="220" rx="340" ry="140" fill="#0D1D3A" opacity="0.35" />
            <ellipse className="cloud cloud-2" cx="850" cy="380" rx="380" ry="160" fill="#14213D" opacity="0.3" />
            <ellipse className="cloud cloud-3" cx="500" cy="140" rx="260" ry="110" fill="#0A1830" opacity="0.25" />
          </g>
        )}

        {/* Radiant sun aura for Clear */}
        {normCond === 'clear' && (
          <g className="sun-aura-group">
            <circle className="sun-core" cx="850" cy="150" r="160" fill="url(#sun-grad)" opacity="0.12" />
            <defs>
              <radialGradient id="sun-grad">
                <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.4" />
                <stop offset="60%" stopColor="#38BDF8" stopOpacity="0.1" />
                <stop offset="100%" stopColor="transparent" stopOpacity="0" />
              </radialGradient>
            </defs>
          </g>
        )}
      </svg>

      {/* Rain Streaks Layer */}
      {(normCond === 'rain' || normCond === 'thunderstorm') && (
        <div className="rain-container">
          {rainDrops.map((drop) => (
            <span
              key={drop.id}
              className="rain-streak"
              style={{
                left: drop.left,
                animationDelay: drop.delay,
                animationDuration: drop.duration,
                height: drop.height,
                opacity: drop.opacity,
              }}
            />
          ))}
        </div>
      )}

      {/* Snow Particles Layer */}
      {normCond === 'snow' && (
        <div className="snow-container">
          {snowFlakes.map((flake) => (
            <span
              key={flake.id}
              className="snow-flake"
              style={{
                left: flake.left,
                animationDelay: flake.delay,
                animationDuration: flake.duration,
                width: flake.size,
                height: flake.size,
                opacity: flake.opacity,
              }}
            />
          ))}
        </div>
      )}

      {/* Fog / Mist Layer */}
      {normCond === 'fog' && (
        <div className="fog-container">
          <div className="fog-layer fog-layer-1" />
          <div className="fog-layer fog-layer-2" />
        </div>
      )}

      {/* Thunderstorm Ambient Flash */}
      {normCond === 'thunderstorm' && (
        <div className="lightning-flash" />
      )}
    </div>
  );
}
