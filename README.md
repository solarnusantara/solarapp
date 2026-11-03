# SolarApp — Solar PV Engineering Studio

> **Dedicated Solar PV CAD, Sizing & BoQ Engineering Suite for SonusID**  
> Part of the [SonusID SuperApp](https://app.sonus.id) ecosystem by PT Solar Nusantara Indonesia.

---

## ⚡ Overview

**SolarApp** is an independent, high-performance web engineering suite purpose-built for solar photovoltaic (PLTS) engineers. It empowers EPC teams to perform complete rooftop and ground-mounted solar feasibility, CAD layout generation, 3D shadow analysis, electrical string configuration, engineering sizing, and automated Bill of Quantities (BoQ) calculation without needing desktop CAD licenses.

This repository (`solarnusantara/solarapp`) serves as the dedicated frontend codebase for the solar engineering team. It can be developed, tested, and previewed completely standalone with zero backend dependencies, or embedded as a Git submodule inside the `erpsonus` monolith serving `app.sonus.id/design`.

---

## 🛠️ Key Capabilities & Modules

1. **PV Layout 2D (CAD Canvas)**:
   - Interactive high-speed 2D canvas editor for module placement (portrait / landscape).
   - Real-time azimuth, tilt, row pitch, and setback margin adjustments.
   - Polygon obstacle placement (HVAC units, skylights, parapet walls) with automatic collision filtering.
   - Export drawings to DXF (AutoCAD compatible), CSV module schedules, and high-res PNG.
2. **Google Maps Satellite Scanner**:
   - Integrated Google Maps Satellite viewer for Indonesian industrial estates (GIIC Cikarang, KIIC Karawang, MM2100 Cibitung, Suryacipta, Krakatau Cilegon, SIER Surabaya).
   - Interactive bounding box scanner to measure factory roof dimensions directly from satellite imagery with automated scale calculation.
3. **PV Layout 3D & Shadow Simulation**:
   - Three.js interactive 3D scene modeling building geometry and solar module arrays.
   - Solar trajectory simulator based on location latitude, longitude, and day of year.
   - Visual shadow projection and shading loss estimation.
4. **Electrical Design (String & Inverter Sizing)**:
   - Dynamic PV module library (Trina, Jinko, Canadian Solar, Longi, etc.).
   - Temperature-corrected $V_{oc\text{ cold}}$ and $V_{mp\text{ hot}}$ calculation.
   - MPPT voltage window and maximum input current verification.
5. **Engineering Calculations**:
   - **Cable Sizing**: DC string and AC feeder voltage drop ($\Delta V \le 1.5\%$) and current carrying capacity (CCC) per IEC 60364.
   - **Protection & Grounding**: DC/AC surge protection devices (Type 1/2 SPD), earthing resistance calculation ($R \le 5\ \Omega$), grounding rod sizing.
   - **Mounting & Structural**: Aluminum rail, mid-clamp, end-clamp, tile/corrugated roof hooks, wind speed & dead load calculations.
   - **Cable Tray Sizing**: Ladder/perforated cable tray fill ratio calculator according to PUIL 2011 / IEC.
   - **Breaker Sizing**: AC/DC MCB, MCCB, and ACB sizing with safety margin factors.
6. **Automated Bill of Quantities (BoQ)**:
   - Instant multi-category material take-off (Panels, Inverters, Structures, DC/AC Cables, Cable Trays, Protection).
   - Real-time costing and SCM procurement code linkage.

---

## 🚀 Quickstart for Solar Engineering Team

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or v20.x
- [npm](https://www.npmjs.com/) v9+

### 1. Clone & Install
```bash
git clone https://github.com/solarnusantara/solarapp.git
cd solarapp
npm install
```

### 2. Run Local Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser. The app runs in **standalone mode** with mock project data and local storage persistence. You can design, simulate, and test all 15 solar engineering tools with instant Vite Hot Module Replacement (HMR)!

### 3. Build Production Bundle
```bash
# Standalone build (outputs to dist/)
npm run build
```

---

## 🔗 Monolith (SuperApp) Integration

When integrated inside `erpsonus` (SonusID SuperApp), this repository is mounted as a Git submodule at:
```
erpsonus/frontend/solar-studio/
```

- When `npm run build` is executed inside `erpsonus/frontend/solar-studio/`, `vite.config.ts` automatically detects the parent repository and emits optimized production bundles to:
  ```
  erpsonus/static/apps/solar-studio/solar-studio.js
  erpsonus/static/apps/solar-studio/solar-studio.css
  ```
- The Rust backend (`tes-sonus`) serves this at `https://app.sonus.id/design` with a dedicated, distraction-free full-bleed workspace and a seamless **SuperApp ↔ SolarApp** topbar switcher.

---

## 💻 Tech Stack
- **Framework**: React 18, TypeScript
- **Bundler**: Vite 6
- **3D Engine**: Three.js
- **Graphics**: HTML5 2D Canvas & Vector Math
- **Icons**: Lucide React
- **Design System**: Tailored Dark Cockpit (`#0c100f`, `#10b981` Emerald, `#e2e8f0` Slate)

---

## 📄 License & Confidentiality
Proprietary & Confidential. Copyright © 2026 PT Solar Nusantara Indonesia. All rights reserved.
