# Implementation Plan: ChekiYuume Photobooth Kiosk

## Overview
ChekiYuume is a modern, high-performance photobooth kiosk web application designed to be packaged into native applications for Windows (Tauri/Electron) and Android (Capacitor). It features two distinct operating modes (**Default Mode** with 1–4 strip presets and **Creative Mode** with 8-shot capture and custom frame placement), a unique **Sequential Videostrip generator** (where video BTS plays slot-by-slot while others display still photos), an **Offline-Ready Session Tracker** with custom guest naming, an **Isolated Iframe Print Engine** supporting A4/4R with paper-saving lane layouts, a **30-day Cloud Storage Gallery Share with QR Code**, and a **Protected Kiosk Admin Panel**.

---

## Architecture Decisions

1. **Frontend Core & Framework:**
   - Svelte 5 + SvelteKit + Vite + Tailwind CSS for maximum runtime reactivity, ultra-fast UI updates during countdown, zero bundle bloat, and touch-optimized kiosk ergonomics.
   - Cross-platform packaging structure: clean separation of hardware adapters (Web standard `MediaDevices` + pluggable native UVC bridge).

2. **Session Lifecycle & Storage:**
   - User enters custom session name / identifier (e.g. guest name, phone, or event tag) in the early flow.
   - Structured Session ID: `CKY-{YYYYMMDD}-{HHmmss}-{RANDOM4}`.
   - Offline-first IndexedDB / LocalStorage queue so sessions are never lost if internet is offline; operators can search and export later.

3. **High-Res Canvas Rendering:**
   - 1080px base canvas width, 972×729px 4:3 photo slots with 54px margin.
   - Default Mode dimensions:
     - 1 Photo (Card): `1080 × 1108 px`
     - 2 Photos (2-Slot Strip): `1080 × 1890 px`
     - 3 Photos (3-Slot Strip): `1080 × 2672 px` *(New calibrated dimension)*
     - 4 Photos (4-Slot Classic): `1080 × 3456 px`
   - High-DPI output (up to 540 DPI) for photo-lab quality prints.

4. **Sequential Videostrip Engine:**
   - Client-side hardware-accelerated video compilation using `WebCodecs API` (`VideoEncoder`) and `mp4-muxer` to produce MP4 (AVC/H.264) @ 30 FPS, 6–8 Mbps without cloud rendering latency.
   - Sequential motion logic: Slot $i$ plays its 3-second BTS countdown video while slots $j \neq i$ render high-res still photos.

5. **Print Engine:**
   - Hidden offscreen isolated `<iframe>` with dynamic `@page` CSS rules to prevent kiosk main UI layout distortion.
   - Supports 4R (`4" × 6"`) and A4 (`210 × 297 mm`), 1x/2x/4x strip copies, Top-Left alignment, and 4-Lane horizontal slot printing for A4 paper reuse.

6. **Cloud Share & QR Code (30-Day TTL):**
   - Cloud storage adapter (Cloudflare R2 / AWS S3 / Supabase Storage with 30-day lifecycle auto-deletion policy).
   - Mobile-responsive download gallery page: `/share/[sessionId]` showing high-res photostrip and sequential videostrip preview + download buttons.

---

## Phase Breakdown

### Phase 1: Foundation & Session Core
- **Task 1:** Project Setup, Dependencies & Scaffolding (SvelteKit, Tailwind CSS, Lucide icons, `mp4-muxer`, `qrcode`, `jszip`).
- **Task 2:** Session State Machine & Guest Naming Service (Session ID, custom name input, IndexedDB local persistence).
- **Task 3:** Camera Hardware Service & Live Dual-Preview Component (1080p/4K stream, countdown timer, audio beeps, shutter flash, BTS video buffer).

### Checkpoint 1: Foundation
- [ ] Camera stream activates smoothly with dual-preview layout.
- [ ] Session tracking records guest name and stores photo/video buffers locally.

### Phase 2: Capture Engine (Default & Creative Modes)
- **Task 4:** Mode Default Implementation (1, 2, 3, 4 Strip Layout selector & Real-time Filling Frame Preview).
- **Task 5:** Mode Creative Implementation (8-Pose Continuous Shoot & Custom Frame Slot Arranger).

### Checkpoint 2: Capture Engine
- [ ] Default Mode captures exact slot count (1-4) with live frame filling.
- [ ] Creative Mode captures 8 shots and allows drag/drop assignment to custom frame slots.

### Phase 3: Rendering & Sequential Videostrip
- **Task 6:** High-Res Photostrip Canvas Engine (300-540 DPI, center crop, custom frame overlays, branding footer).
- **Task 7:** Sequential Videostrip Compiler (WebCodecs + `mp4-muxer`, slot-by-slot sequential playback, MP4/WebM export).

### Checkpoint 3: Rendering
- [ ] Photostrip PNG exported with crisp 1080px width.
- [ ] Sequential Videostrip MP4 renders smoothly in-browser with sequential playback.

### Phase 4: Distribution, Print & Cloud
- **Task 8:** Result Screen & Mobile Share Gallery (Dynamic QR Code, cloud upload adapter, 30-day share viewer).
- **Task 9:** Isolated Iframe Print Engine (A4/4R dialog, 1x/2x/4x copies, paper-saving A4 4-lane layout).

### Checkpoint 4: Distribution & Print
- [ ] Print modal triggers system printer via hidden iframe cleanly.
- [ ] QR code directs to mobile-friendly download page.

### Phase 5: Admin Panel & Kiosk Hardening
- **Task 10:** Protected Kiosk Admin Panel (PIN access, camera/countdown/printer/cloud settings, session history log & offline re-export).
- **Task 11:** Kiosk UI Polish, Auto-Reset Timeout, Touchscreen Optimization & Cross-Platform Packaging Readiness.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| Older browser/device without WebCodecs support | High (Video encoding fails) | Implement automatic fallback to `MediaRecorder` + WebM compiler. |
| Kiosk internet disconnection during event | Medium (QR upload fails) | Offline-first queue saves all assets with Guest Name; shows offline notification; operator can sync later. |
| Large video memory footprint during 8-shot capture | Medium (Browser memory spike) | Efficient blob streaming, auto-cleanup of unselected BTS video chunks in Creative mode. |
