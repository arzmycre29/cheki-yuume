# ChekiYuume - Master Task Breakdown & Checklist

## Phase 1: Foundation & Session Core

- [x] **Task 1: Project Setup, Dependencies & Scaffolding**
  - **Description:** Initialize SvelteKit project with Vite, Tailwind CSS v4, Lucide icons, `mp4-muxer`, `qrcode`, and `jszip`.
  - **Acceptance Criteria:**
    - Clean development server starts without warnings.
    - Path aliases, Tailwind utility styling, and icon support functioning.
    - Project structured for future packaging (Tauri/Capacitor).
  - **Verification:** `npm run build` succeeds, `npm run check` passes.
  - **Files:** `package.json`, `svelte.config.js`, `vite.config.js`, `src/app.html`, `src/app.css`
  - **Scope:** Medium (3-5 files)

- [x] **Task 2: Session State Machine & Guest Naming Service**
  - **Description:** Build the session management store, unique ID generator (`CKY-YYYYMMDD-HHmmss-XXXX`), custom guest/session name prompt modal, and IndexedDB local persistence queue.
  - **Acceptance Criteria:**
    - State tracks: `sessionId`, `sessionName`, `mode` (`'default' | 'creative'`), `selectedLayout`, `photos` array, `btsVideos` array, `status`, `printCount`.
    - Sessions persist to local IndexedDB for offline recovery.
  - **Verification:** Unit test state transitions (New -> Name Input -> Capture -> Render -> Finish).
  - **Files:** `src/lib/stores/session.ts`, `src/lib/services/db.ts`, `src/lib/types/index.ts`
  - **Scope:** Medium (3-4 files)

- [x] **Task 3: Camera Hardware Service & Live Dual-Preview Component**
  - **Description:** Create camera controller supporting W3C `getUserMedia`, resolution probing (1080p/4K), mirror toggle, countdown audio-visual effects (beep + screen flash), and synchronized BTS video snippet recorder.
  - **Acceptance Criteria:**
    - Live feed displays with zero lag and configurable aspect ratio.
    - Countdown triggers 3-second BTS recording before taking snapshot.
    - Audio beeps and visual flash execute on shutter moment.
  - **Verification:** Live camera stream activates and successfully produces photo blob + BTS video blob.
  - **Files:** `src/lib/services/camera.ts`, `src/lib/components/CameraView.svelte`, `src/lib/components/CountdownOverlay.svelte`
  - **Scope:** Medium (3-5 files)

---

## Checkpoint 1: Foundation
- [x] Dev server runs smoothly.
- [x] Camera stream activates, dual preview renders, and session ID is assigned with custom guest name.

---

## Phase 2: Capture Engine (Default & Creative Modes)

- [x] **Task 4: Mode Default Implementation (1-4 Strip Presets)**
  - **Description:** Implement Default Mode UI: layout picker (1 Card, 2 Strip, 3 Strip, 4 Classic Strip), live capture screen with split view, where the selected frame automatically populates slots as each photo is snapped.
  - **Acceptance Criteria:**
    - Supports 1-photo (1080x1108), 2-photo (1080x1890), 3-photo (1080x2672), and 4-photo (1080x3456) layouts.
    - Right side displays the frame template with photo slots filling in real-time.
    - Automatically advances to processing once required slot count is met.
  - **Verification:** Test 1, 2, 3, and 4 strip capture flows end-to-end.
  - **Files:** `src/lib/components/modes/DefaultCaptureFlow.svelte`, `src/lib/components/LiveStripPreview.svelte`, `src/lib/components/FrameSelector.svelte`
  - **Scope:** Medium (3-5 files)

- [x] **Task 5: Mode Creative Implementation (8-Pose Shoot & Custom Frame Arranger)**
  - **Description:** Implement Creative Mode UI: continuous 8-pose capture screen with thumbnail gallery, followed by a Custom Frame selection screen with drag-and-drop / slot-assignment UI to map chosen photos to frame slots.
  - **Acceptance Criteria:**
    - Captures exactly 8 photos with BTS clips and displays thumbnail list.
    - Frame selector presents custom frame designs.
    - Users can assign/swap selected photos into frame slots easily on touchscreens.
  - **Verification:** Verify capturing 8 photos and placing selected photos into a 3-slot or 4-slot custom frame.
  - **Files:** `src/lib/components/modes/CreativeCaptureFlow.svelte`, `src/lib/components/modes/CreativeArranger.svelte`
  - **Scope:** Medium (3-5 files)

---

## Checkpoint 2: Capture Engine
- [x] Default Mode captures exact photo counts with live slot filling.
- [x] Creative Mode captures 8 photos and allows interactive slot customization.

---

## Phase 3: High-Res Rendering & Sequential Videostrip

- [x] **Task 6: High-Res Photostrip Canvas Engine (300-540 DPI)**
  - **Description:** Build Canvas 2D composite renderer for photostrip image generation. Handles 4:3 center-cropping, background templates, border radius, stickers/logos, and export to PNG / high-quality JPEG.
  - **Acceptance Criteria:**
    - Generates pixel-perfect 1080px wide photostrips for 1, 2, 3, and 4 photo layouts.
    - Center-crop algorithm preserves subject proportions without distortion.
    - Fast rendering (<500ms).
  - **Verification:** Inspect exported PNG dimensions and sharpness.
  - **Files:** `src/lib/utils/canvasRenderer.ts`, `src/lib/config/frameLayouts.ts`
  - **Scope:** Medium (2-3 files)

- [x] **Task 7: Sequential Videostrip Compiler (WebCodecs + mp4-muxer)**
  - **Description:** Build the video compiler that generates the sequential videostrip: each slot animates its BTS clip in sequence while non-active slots display crisp still photos. Muxes into MP4 (H.264) via `mp4-muxer` with WebM fallback.
  - **Acceptance Criteria:**
    - Produces high-bitrate (6 Mbps) MP4 at 30 FPS.
    - Plays slot 1 BTS -> slot 2 BTS -> ... -> slot N BTS sequentially in a continuous loop.
    - Video dimensions match photostrip (1080x1108, 1080x1890, 1080x2672, 1080x3456).
  - **Verification:** Play exported MP4 in native video players (VLC/QuickTime/Chrome/Mobile).
  - **Files:** `src/lib/utils/videoCompiler.ts`
  - **Scope:** Medium (3-4 files)

---

## Checkpoint 3: Rendering
- [x] Photostrip PNG matches precise canvas specifications.
- [x] Sequential Videostrip MP4 plays slot-by-slot animation cleanly.

---

## Phase 4: Distribution, Print & Cloud Sharing

- [x] **Task 8: Result Screen & Mobile Share Gallery (30-Day Cloud TTL)**
  - **Description:** Build finish screen with dynamic QR code, video player, and cloud upload service (Cloudflare R2 / S3 / Supabase Storage adapter with 30-day lifecycle auto-delete) and the public `/share/[sessionId]` gallery page.
  - **Acceptance Criteria:**
    - Result screen displays photostrip & looping videostrip preview.
    - QR Code links to `/share/[sessionId]` with instant mobile download buttons for photo and video.
    - Offline fallback graceful notice if internet is disconnected.
  - **Verification:** Scan generated QR code on mobile device and download assets.
  - **Files:** `src/routes/result/+page.svelte`, `src/routes/share/[sessionId]/+page.svelte`, `src/lib/services/cloudStorage.ts`
  - **Scope:** Medium (3-5 files)

- [x] **Task 9: Isolated Iframe Print Engine (A4 & 4R)**
  - **Description:** Implement print dialog with paper size selection (A4 / 4R), orientation (Portrait / Landscape), copies (1x, 2x, 4x), alignment (Top-Left / Center), and A4 4-lane paper saving mode, using isolated hidden `<iframe>`.
  - **Acceptance Criteria:**
    - Isolated iframe prevents main kiosk CSS pollution.
    - 2x copies layout renders double strip 2"x6" on 4R paper accurately.
    - A4 4-lane mode allows printing onto specific quadrants of A4 paper.
  - **Verification:** Test print dialog trigger and verify `@page` CSS output.
  - **Files:** `src/lib/services/printEngine.ts`, `src/lib/components/PrintModal.svelte`
  - **Scope:** Medium (2-3 files)

---

## Checkpoint 4: Distribution & Print
- [x] Result screen renders QR code and previews.
- [x] Print modal triggers printer spooler with accurate paper dimensions.

---

## Phase 5: Admin Panel & Kiosk Hardening

- [x] **Task 10: Protected Kiosk Admin Panel & Settings**
  - **Description:** Create hidden Admin Panel (tap trigger + PIN protection) with camera device selection, countdown timer config, printer layout defaults, cloud credentials setup, frame asset manager, and session history table with manual export/re-print.
  - **Acceptance Criteria:**
    - PIN protects admin routes.
    - Admin can test cameras, change countdown seconds, and view all recorded offline sessions.
    - Sessions can be re-printed or exported to a ZIP file.
  - **Verification:** Test changing settings and verifying immediate effect in kiosk mode.
  - **Files:** `src/routes/admin/+page.svelte`
  - **Scope:** Medium (4-5 files)

- [x] **Task 11: Kiosk UI Polish, Auto-Reset Timeout & Cross-Platform Packaging Readiness**
  - **Description:** Polish transitions, sound effects, touchscreen interactions, full-screen kiosk lock, auto-reset idle timeout, and verify cross-platform wrappers (Tauri / Capacitor).
  - **Acceptance Criteria:**
    - Kiosk auto-resets to Welcome screen after 60 seconds of inactivity on the Result screen.
    - No cursor scrollbars or unwanted zoom gestures on touchscreens.
    - Standalone production build succeeds.
  - **Verification:** `npm run build && npm run preview` verified end-to-end.
  - **Files:** `src/routes/+layout.svelte`, `src/lib/utils/sounds.ts`, `src/routes/+layout.ts`
  - **Scope:** Medium (3-5 files)

---

## Checkpoint 5: Complete
- [x] Full end-to-end kiosk flow from Welcome -> Name -> Mode -> Capture -> Render -> Share/Print -> Auto-reset verified.
- [x] Ready for deployment and native packaging.
