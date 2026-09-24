# SkyGuard AI — Antigravity + Stitch UI/UX Prompt

> Paste this whole document (or the "COPY-PASTE PROMPT" block at the top) into Google
> Antigravity / Stitch when generating the front end. This is the single source of truth for
> visual design — do not let the UI drift from these tokens once locked.

---

## 🎯 COPY-PASTE PROMPT (use this as the literal prompt)

```
Design and build the front end for "SkyGuard AI" — a real-time, explainable anomaly-detection
dashboard for Automatic Weather Stations, built for a disaster-management AI hackathon.

PRODUCT CONTEXT
SkyGuard AI watches temperature, pressure and humidity from a network of weather stations,
detects sensor faults vs. real weather events, explains its reasoning (SHAP/LIME-based),
scores its own confidence, predicts sensor health, and can suggest corrected values. This is a
serious scientific/disaster-management tool, not a consumer app — but it should still feel
premium, calm, and alive, like a mission-control room for the atmosphere.

DESIGN DIRECTION — READ CAREFULLY
Do NOT produce a generic "AI SaaS" look. Explicitly avoid: purple-to-blue gradient hero
sections, glass cards with a thin white 1px border on a plain black background, Inter font at
default weights, rounded-2xl everything, stock "robot/circuit" iconography, and centered
hero + 3-feature-cards + testimonials templates. This should look like nobody else's AI
dashboard.

VISUAL IDENTITY
- Theme: dark, moody, meteorological "mission control" — think a night-shift forecasting room,
  not a startup landing page.
- Color palette (dark, unique, restrained — not neon, not purple/blue cliché):
  - Base background: near-black with a violet undertone — #0B0710 to #120B18
  - Secondary surface / panels: deep dark violet — #1E1428, #2A1A38
  - Primary accent (alerts, key actions): deep maroon/wine — #7A2436, brightened to #A6394F
    for interactive states
  - Secondary accent (calm/healthy status, data-normal state): muted moss/sage green —
    #5C7A5E, #7C9B7E for highlights
  - Tertiary accent (warnings, mid-severity): a dusty amber-rust, NOT bright orange —
    #B5693F
  - Text: warm off-white #EDE6E0 for primary text, #A99BA8 (dusty mauve-grey) for secondary text
  - Never use pure black (#000) or pure white (#FFF) anywhere.
- Typography: pair a distinctive humanist/grotesk sans for UI text (e.g. something like
  Söhne/General Sans/Space Grotesk energy — NOT default Inter) with a monospace font for all
  numeric/sensor data readouts (e.g. JetBrains Mono / IBM Plex Mono) so live numbers feel
  instrument-like and precise. Headlines can use a slightly condensed or serif-influenced
  display face for character — avoid generic geometric sans for hero text.
- Motion background: a subtle, slow, ALWAYS-RUNNING animated background suggesting atmospheric
  flow — not particles-as-stars, not a generic gradient blob mesh. Ideas: faint animated
  isobar/contour lines slowly drifting and reshaping (like a pressure map), or a very slow
  parallax of translucent cloud-like shapes in the maroon/violet palette drifting at
  different speeds, or a subtle animated wind-vector field (thin curved lines with faint
  motion) at ~5-10% opacity so it never competes with content. Must be CSS/SVG/canvas based,
  performant, and pause/reduce under prefers-reduced-motion.
- Cards/panels: avoid plain flat glassmorphism. Use subtle layered depth — soft inner glow in
  the accent color on active/live elements, thin gradient hairline borders (violet-to-maroon)
  rather than plain white borders, slightly irregular/organic corner treatment on hero
  elements to break the "everything is a rounded rectangle" AI-app look.
- Status color language: green-moss = healthy/normal, amber-rust = warning/medium severity,
  maroon/wine = critical/high severity, dusty mauve-grey = offline/no-data. Never use default
  red/green/yellow traffic-light colors.
- Micro-interactions: live numbers should subtly tick/update (not jarring), anomaly events
  should pulse once with a soft glow in their severity color, map station markers should have
  a slow "breathing" animation when healthy and a faster urgent pulse when critical.

SCREENS TO BUILD
1. Landing / Mission screen — bold statement of the grand challenge, live network status
   teaser (e.g. "247 stations monitored, 3 anomalies caught this hour"), motion background
   fully visible here, single clear CTA into the dashboard.
2. Live Network Map — full map of stations, color-coded by health/anomaly status, side panel
   listing recent events, click a station to open its detail view.
3. Station Detail — time-series charts for temperature/pressure/humidity with anomaly points
   marked distinctly, a raw-vs-corrected toggle, sensor health badge.
4. Anomaly Feed / Alert Center — real-time scrolling list of anomaly events, filterable by
   severity / root-cause / station, each row expandable.
5. Explainability Drill-Down — for a selected anomaly: confidence gauge, SHAP-style
   feature-contribution bars, plain-language reasoning text, root-cause tag.
6. Sensor Health Dashboard — grid of station health scorecards, degradation trend
   sparklines, "needs maintenance" list sorted by urgency.
7. Analytics & Reports — historical trend charts, detection-accuracy summary, export button.
8. Settings / Threshold Config — sensitivity sliders, alert-channel toggles, clean form UI
   consistent with the dark theme (not a jarring light-mode settings panel).
9. Demo/Judge Mode — a distinct "inject anomaly" control (clearly a demo tool, styled
   slightly differently, e.g. a console/terminal-like panel) that lets a user trigger a fake
   anomaly and watch the whole system react live across the other screens.

LAYOUT & RESPONSIVENESS
- Desktop-first (this is a monitoring tool), but every screen must degrade gracefully to
  tablet and mobile: map and charts stack vertically, side panels become bottom sheets or
  tabs on small screens.
- Use a persistent left sidebar for navigation on desktop; collapse to a bottom nav or
  hamburger on mobile.
- Respect safe-area insets on mobile, keep touch targets ≥ 44px.

TONE / MICROCOPY
- Confident, precise, calm — like a professional instrument, not a chatty consumer app.
  E.g. "3 stations flagged — reviewing" rather than "Uh oh, something's wrong! 😬"

DELIVERABLE
Build this as a cohesive design system first (color tokens, type scale, spacing, motion
rules, component library: buttons, cards, badges, charts, map markers, alert rows), then
compose the 9 screens above from that system. Keep the whole thing internally consistent —
no screen should look like it came from a different app.
```

---

## 🎨 Design Tokens Reference (for the whole team — keep in sync with the prompt above)

### Color Tokens
| Token | Hex | Use |
|---|---|---|
| `bg-base` | `#0B0710` | App background |
| `bg-surface` | `#1E1428` | Panels/cards |
| `bg-surface-raised` | `#2A1A38` | Elevated cards, modals |
| `accent-maroon` | `#7A2436` | Critical alerts, primary CTAs |
| `accent-maroon-bright` | `#A6394F` | Hover/active states |
| `accent-green` | `#5C7A5E` | Healthy/normal status |
| `accent-green-bright` | `#7C9B7E` | Healthy highlights |
| `accent-amber` | `#B5693F` | Warning/medium severity |
| `text-primary` | `#EDE6E0` | Body/headline text |
| `text-secondary` | `#A99BA8` | Secondary/meta text |
| `border-hairline` | gradient `#7A2436 → #2A1A38` | Card borders |

### Type Scale (suggestion)
- Display / Hero: 48–64px, condensed or serif-influenced display face
- H1: 32px · H2: 24px · H3: 18px — humanist/grotesk sans
- Body: 15–16px — same sans
- Data/numeric readouts: 16–40px, monospace (JetBrains Mono / IBM Plex Mono), tabular-nums

### Motion Rules
- Background motion: continuous, slow (30–90s loop), ≤10% opacity, never blocks content
- Live data ticks: 200–400ms ease transitions, no bounce
- Anomaly pulse: single soft glow pulse (600ms) in severity color on new event
- Respect `prefers-reduced-motion`: freeze background, keep only essential state-change transitions

---

## ✅ Anti-Pattern Checklist (reject the output if any of these show up)

- [ ] Purple-to-blue gradient hero
- [ ] Plain white 1px borders on glass cards
- [ ] Default Inter font, default weights, no numeric font distinction
- [ ] Generic rounded-2xl-everything with no organic/irregular accents
- [ ] Bright neon red/green/yellow status colors
- [ ] Centered hero + 3 feature cards + testimonials template layout
- [ ] Stock robot/circuit-board iconography
- [ ] Static (non-animated) background despite "motion background" requirement

---

## 🔁 Iteration Protocol

When re-prompting Antigravity/Stitch for a specific screen, always re-paste the **Design
Tokens Reference** section so color/type/motion stay locked across every generation, and
reference the screen name exactly as listed above (e.g. "generate Screen 5: Explainability
Drill-Down") so outputs stay addressable and swappable.
