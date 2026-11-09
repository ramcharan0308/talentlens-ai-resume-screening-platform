# Design System Master File — TalentLens Nordic Instrumentarium

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** TalentLens — AI Resume Screening & Recruitment Operations SaaS  
**Visual Aesthetic:** Nordic Instrumentarium (Tactile Mineral Basalt, Anodized Bronze & Telemetry Sage)  
**Art Direction Philosophy:**  
Moving decisively away from generic navy/blue/purple AI SaaS dashboards. TalentLens is treated as a precision optical instrument—combining the tactile mechanical elegance of Teenage Engineering, the architectural restraint of Swiss Modernism 2.0, and the high-contrast operational density of Leica/Ramp interfaces.

Surfaces feel like milled mineral basalt and honed slate. Accents evoke precision anodized warm bronze (`#E69124`), optical glass reflections, alpine telemetry sage (`#10B981`), and warm bone chalk typography (`#F7F6F2`).

---

## 1. Visual Research & Reference Analysis

| Reference | URL / Platform | Specific Visual Inspected | Adaptable Principle | Adapted in TalentLens |
| :--- | :--- | :--- | :--- | :--- |
| **Teenage Engineering** | `teenage.engineering` | Anodized knobs, matte mineral finishes, warm bone type | Mechanical precision, physical switches, warm basalt rather than cold blue | Surface elevation ladder, tactile pill switches, chamfer borders |
| **Aceternity UI** | `ui.aceternity.com` | 3D Pin, 3D Card, Spotlight Shader, Bento Grid | Optical perspective shift on hover, radial spotlight illumination | `SpotlightCard`, `ThreeDCardContainer`, interactive bento layouts |
| **React Bits** | `reactbits.dev` | DecryptedText, BlurText, ShinyText, TiltCard | Text encryption reveal on load, holographic badge shine | `AnimatedText`, `ShinyBadge`, telemetry ticker animations |
| **21st.dev** | `21st.dev` | Tech Stack Bento Grid, Animated workflow hubs, Sliding Cards | Micro-interaction tracking, live telemetry indicators | Requisition lifecycle funnel bento, candidate dossier cards |
| **Awwwards / Godly** | `godly.website` | Optical refraction lenses, tactile brutalist precision | Unmistakable brand identity, genuine 3D glass refraction | `TalentLens3DScene` (3D optical refraction prism with laser reticles) |
| **Lenis & GSAP** | `lenis.dev` / `gsap.com` | Smooth momentum scrolling + ScrollTrigger choreography | Inertial feel with zero interference on native inputs or modals | `SmoothScrollProvider` + scroll-linked card transforms |

---

## 2. Surface Elevation & Color Architecture

Instead of generic blue/navy gradients or flat white cards, depth is constructed through a **Mineral Basalt Surface Ladder** with warm chamfer hairline borders (`border-stone-700/50` / `rgba(230, 225, 215, 0.08)`):

| Token / Layer | Hex Value | HSL / CSS Var | Purpose |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `#0D0F0E` | `150 4% 5.5%` | Base application canvas, non-reflective deep warm basalt |
| **Surface Level 1 (Shell)** | `#131615` | `150 4% 8%` | Global navigation bar, sidebar, section headers |
| **Surface Level 2 (Card)** | `#1A1D1C` | `150 4% 11%` | Dossier cards, requisition panels, metric containers |
| **Surface Level 3 (Lift)** | `#232726` | `150 4% 15%` | Hover states, modals, popovers, nested widgets |
| **Surface Level 4 (Pills)** | `#2D3230` | `150 4% 19%` | Filter pills, status chips, code badges, input fields |
| **Hairline Border** | `rgba(230,225,215,0.08)` | `45 10% 20%` | Warm micro-borders mimicking precision machined chamfers |
| **Foreground (Chalk)** | `#F7F6F2` | `45 15% 96%` | Headings, candidate names, high-contrast text |
| **Muted Text** | `#A6A59D` | `45 8% 65%` | Secondary descriptions, subtexts, metadata |
| **Subtle Text** | `#73726B` | `45 6% 45%` | Timestamps, inactive counts, minor annotations |

### Chromatic Signatures (Tactile & Grounded)

- **Anodized Warm Bronze (Primary)**: `#E69124` / `#D97706` (`hsl(36, 82%, 53%)`) — Primary action buttons, active tab indicators, focus rings, optical lens highlights.
- **Alpine Telemetry Sage (Evidence & SLA Met)**: `#10B981` / `#34D399` (`hsl(158, 64%, 48%)`) — Verbatim resume quotation callouts, match score &ge; 85%, SLA targets met, verified credentials.
- **Cadmium Amber (Pending & Fixtures)**: `#F59E0B` / `#FBBF24` (`hsl(42, 85%, 52%)`) — Pending reviews, 48h timers, benchmark test fixtures.
- **Terracotta Ochre (Destructive & Erasure)**: `#E54833` / `#F87171` (`hsl(8, 76%, 54%)`) — Section 12 Right-to-Erasure execution, rejections.
- **Raw Umber / Client Tone**: `#C27838` / `#E09F5A` (`hsl(28, 70%, 50%)`) — Client hiring manager portal, masked candidate reference chips.

---

## 3. Typography & Information Hierarchy

- **Display & Headings**: Plus Jakarta Sans (`font-extrabold`, `letter-spacing: -0.025em`) with tight, unhurried tracking for architectural clarity.
- **Body & Data Tables**: Plus Jakarta Sans (`font-normal` & `font-semibold`, `leading-relaxed`).
- **Telemetry & Grounded Offsets**: JetBrains Mono / Geist Mono (`font-mono`, `tabular-nums`) for Candidate IDs (`CND-91088`), citation offsets (`Offset: 412–478`), match scores (`92 / 100`), and SLA hours (`28.4h / 48.0h`).

---

## 4. 3D Visual Experience: "The Optical Talent Prism"

Rather than generic floating dots or flat particle networks, the hero and authentication screens feature a custom Three.js WebGL spatial scene (`TalentLens3DScene`):
- **Geometry**: A precision optical refraction prism (icosahedral/dodecahedral glass crystal) with wireframe reticles and orbiting candidate telemetry nodes.
- **Materials**: MeshPhysicalMaterial with transmission, roughness, and metalness simulating real optical glass and anodized bronze wireframes.
- **Dynamic Laser Reticles**: Math-driven focal lines that converge on candidate coordinate nodes upon mouse movement.
- **Performance & Accessibility**: Lazy loaded, automatic WebGL resource disposal on unmount, full `prefers-reduced-motion` compliance with a static geometric SVG fallback.

---

## 5. Motion Design System (Motion + GSAP + Lenis)

1. **Motion for React (`motion/react`)**: Component-level physics, page entrances, modal reveals, tab slider pills, and card lift hover states (`cubicEase = [0.16, 1, 0.3, 1]`).
2. **GSAP + ScrollTrigger**: Scroll-linked timeline animations for the candidate lifecycle funnel, pinned sections, and metric count-up reveals.
3. **Smooth Inertial Scrolling (Lenis)**: Native-feeling smooth momentum scrolling with automatic bypass for modals, dropdowns, and keyboard accessibility.
4. **Strict Separation of Concerns**: Never animate the same DOM node with both Motion and GSAP.

---

## 6. Pre-Delivery Visual QA Criteria

- [x] Zero generic navy/blue/purple SaaS gradients.
- [x] Zero flat white (`#ffffff`) card backgrounds.
- [x] Warm Basalt (`#0D0F0E`) canvas with Warm Bronze (`#E69124`) and Sage (`#10B981`) accents.
- [x] Fully interactive 3D Optical Talent Prism with real geometry, specularity, and lighting.
- [x] Clean browser QA across all 10 key routes and responsive breakpoints (1440px desktop to 375px mobile).
