---
doc: checklist
status: approved
---

# Build Checklist

Build mode: learn

## Slices

- [x] **1. Project scaffold and live 3D Earth Globe with Day/Night atmosphere**
  Becomes usable: A running local Vite web application displaying an interactive 3D WebGL globe with stars, smooth mouse/touch rotation, zoom, and dynamic Day/Night theme switching.
  Why now: Puts the center stage directly into our hands from minute one. If the 3D globe didn't spin smoothly, nothing else would matter.
  PRD ref: `prd.md > Screens and Layout`, `prd.md > Look and Feel`, `prd.md > Interactive 3D Globe & Celestial Space`
  Spec ref: `spec.md > Stack`, `spec.md > Components > GlobeScene`, `spec.md > File Structure`
  Build: Initialize Vite + Three.js project, implement `index.html`, `src/style.css` (with daylight paper and midnight cosmic palettes), `src/globe.js` (Three.js sphere, orbit controls, starfield), and top control bar with theme toggle.
  Verify (mechanical): Start Vite dev server; confirm page renders canvas without console errors and responds to orbit drag.
  Learner check: Open http://localhost:5173/, rotate the globe, toggle between Day and Night modes, and confirm the visual atmosphere feels right.
  Commit: `Scaffold app and render interactive 3D globe with day/night themes`

- [x] **2. Seeded global mood pins and celestial wishing markers**
  Becomes usable: The globe displays glowing pins across world cities (Tokyo, Cairo, London, São Paulo, New York, etc.) colored by feeling, plus celestial markers (Shooting Stars and Moon) floating in the sky.
  Why now: Directly delivers the unique emotional kernel (*"you are not alone"*) so the world feels immediately populated and alive.
  PRD ref: `prd.md > Global Discovery`, `prd.md > Features and Behavior (1 & 2)`
  Spec ref: `spec.md > Data Model`, `spec.md > Components > DataStore`
  Build: Implement `src/store.js` with rich seed entries and `localStorage` persistence, calculate spherical coordinates on the 3D globe, and render pins and celestial objects with mood glows.
  Verify (mechanical): Inspect 3D scene objects; verify pin coordinates and glow meshes match store entries count.
  Learner check: Spin the globe and spot pins from different countries and celestial markers in the sky.
  Commit: `Render seeded global mood pins and celestial markers`

- [x] **3. Author Journey Timeline modal and empathetic reactions**
  Becomes usable: Clicking any pin or celestial marker opens the author's card, displays their reflection, and reveals their chronological Personal Journey Timeline. If it's their first entry, shows the mascot ("Their journey starts here"). Users can tap 💙 *"You're Not Alone"*, 🫂 *"Sending Warmth"*, and ✨ *"Strength"* to increment live reaction counters.
  Why now: Proves the core reading and connection loop end-to-end.
  PRD ref: `prd.md > Reading & Connecting`, `prd.md > Sending Warmth`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > Components > UIManager`, `spec.md > Data Model`
  Build: Implement raycasting click detection in `src/globe.js`, build `src/ui.js` modal with timeline feed, SVG mascot for single-entry authors, and wire one-tap reaction counters to `src/store.js`.
  Verify (mechanical): Simulate pin click; confirm modal opens with author details, mascot displays for single entries, and clicking reactions updates store and localStorage.
  Learner check: Click a pin in Cairo or Tokyo, browse their timeline, and send a reaction to see the counter increase.
  Commit: `Add author timeline modal with mascot state and live empathetic reactions`

- [x] **4. Reflection Composer and live pin dropping**
  Becomes usable: Users can click the floating `+` button to compose their own diary reflection, optionally pick a feeling, choose Earth or celestial destination (Shooting Star / Moon), submit it, and immediately watch their new pin appear live on the globe or sky.
  Why now: Completes the creation loop and allows users to contribute their voice to the world.
  PRD ref: `prd.md > Adding an Entry`, `prd.md > Friction-Free Venting Philosophy`
  Spec ref: `spec.md > Components > UIManager`, `spec.md > DataStore`
  Build: Add floating `+` button, create composer modal in `src/ui.js` (feelings optional, gentle guidance if text empty), save to `src/store.js`, and dynamically spawn new pin mesh in `src/globe.js`.
  Verify (mechanical): Submit an entry with and without feeling tag; verify entry persists in localStorage and a new 3D pin is added to the scene.
  Learner check: Click `+`, write a personal reflection, pick a destination, submit, and see your pin light up on the globe!
  Commit: `Implement reflection composer and dynamic live pin placement`

- [x] **5. Compassionate "You Are Not Alone" Check-In and recency filter**
  Becomes usable: Users can filter pins by recency (*Recent / Today* vs. *All*), and trigger the compassionate check-in prompt at any time (or on exit) to receive an encouraging message and gentle feeling reflection.
  Why now: Puts the finishing emotional touches on the experience to fulfill the exact PRD vision.
  PRD ref: `prd.md > Compassionate Check-In`, `prd.md > Global Discovery`
  Spec ref: `spec.md > Components > UIManager`
  Build: Add recency filter buttons in top bar, implement compassionate check-in modal in `src/ui.js` with unload listener, and connect filter to pin visibility in `src/globe.js`.
  Verify (mechanical): Toggle recency filter and confirm pin visibility toggles; trigger check-in button and confirm modal opens with supportive copy.
  Learner check: Try the recency filter, click the "You Are Not Alone" heart button, and confirm the compassionate check-in works smoothly.
  Commit: `Add recency filter and compassionate exit check-in modal`

## Hands-on Checkpoints

- [x] Early usable behavior explored — [Slice 1 & 2: 3D Globe with live pins and day/night themes]
- [x] Final kick-the-tires exploration and feedback completed

## Final Review

- [x] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: [to be recorded upon completion]
Route and stops: [to be recorded upon completion]
Edit outcome: [to be recorded upon completion]
Reflection: [to be recorded upon completion]
Activity mode: [to be recorded upon completion]

## Revisions

