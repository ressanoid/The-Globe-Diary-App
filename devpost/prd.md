---
doc: prd
status: approved
---

# The Globe Diary — Product Requirements Document

A global interactive 3D diary and emotional solidarity web application where people record their reflections, discover that they are never alone in this world, and send silent heartfelt support across the globe.

Source: `scope.md > The Unique Kernel` & `scope.md > Who It's For`.

---

## The Core Journey

1. **Arrival & Atmosphere:** The user arrives at an interactive 3D globe centered on screen. The visual ambiance reflects daylight (warm, earthy paper journal tones) or night (calming midnight celestial dark mode with glowing pins), with an intuitive switch to preview either mood.
2. **Global Discovery:** Glowing mood pins appear across continents, plus celestial wish markers (Shooting Stars / Moon) in the surrounding space. A recency filter allows viewing posts from *Recent / Today* or *All*.
3. **Reading & Connecting:** The user clicks any glowing pin or shooting star. A modal opens showing the author's diary entry, location, mood, and their chronological **Personal Journey Timeline**. If it's the author's first entry, a gentle cartoonish mascot writes: *"Their journey starts here."*
4. **Sending Warmth:** The user sends one-tap emotional reactions (💙 *"You're Not Alone"*, 🫂 *"Sending Warmth"*, ✨ *"Strength"*).
5. **Adding an Entry:** The user taps the floating `+` button. A compassionate modal opens allowing them to share their handle, choose a feeling rating (optional), write their reflection, and select whether to pin it to Earth (a city/country) or cast it as a **Shooting Star / Moon** beacon.
6. **Instant Visibility:** On submitting, the new pin or shooting star immediately manifests live on the globe/sky.
7. **Compassionate Check-In:** When exiting or tapping the check-in button, a caring prompt asks: *"Remember, you are not alone in this world. How are you feeling right now?"*

---

## Screens and Layout

The application uses a **single cohesive, immersive viewport**:
- **Center Stage:** The interactive 3D Globe with orbit controls (rotate, zoom, click pins) and celestial sky containing Moon and Shooting Star markers.
- **Top Control Bar:** App title, Day/Night ambiance toggle, and recency filter (*Recent / Today* vs. *All Time*).
- **Floating Action Button (`+`):** Bottom-right or bottom-center button to compose a new diary reflection.
- **Support / Check-In Button:** Gentle persistent button (*"You Are Not Alone"*) to trigger the emotional check-in prompt at any time.
- **Modals / Overlays:**
  - **Diary Detail & Timeline Modal:** Slides in or overlays smoothly when a pin is selected, featuring the author's story and timeline.
  - **New Reflection Composer Modal:** Clean, friction-free input dialog.
  - **Check-In Modal:** Compassionate reflection dialog.

---

## Look and Feel

- **Dynamic Atmosphere:**
  - **Day Mode:** Soft, grounding, natural paper journal aesthetics, warm parchment accents, and comforting organic tones.
  - **Night Mode:** Deep midnight space, cosmic nebula hues, and glowing cyan, violet, and amber pin lights.
  - Smooth visual transitions between day and night themes.
- **Typography:** Warm, legible, humanistic typography (e.g. Outfit, Plus Jakarta Sans, or Inter) paired with gentle rounded cards to feel like an authentic, safe sanctuary.
- **Emotional Resonance:** Soft glowing pin pulses, calming micro-animations, and gentle cartoonish mascot illustrations for welcoming moments.

---

## Features and Behavior

### 1. Interactive 3D Globe & Celestial Space
- Interactive sphere with realistic continents and glowing atmosphere.
- Pinpoints placed geographically with mood colors (e.g., Hopeful = Cyan/Gold, Struggling = Soft Indigo/Violet, Peaceful = Emerald/Teal).
- Surrounding celestial space with clickable **Shooting Stars** and **Moon** markers for cosmic wishes and venting.
- Mouse/touch drag to rotate, scroll/pinch to zoom.

### 2. Viewing a Diary & Personal Timeline
- Clicking any pin or star focuses it and opens the **Author Journey Modal**.
- Displays: Author handle, location/destination, timestamp, feeling badge (if provided), and reflection body.
- **Personal Journey Timeline:** Chronological feed of this author's reflections showing how their days evolve.
- **Single-entry Empty State:** If the author has only 1 entry, displays a warm cartoonish mascot holding a journal with the caption: *"Their journey starts here."*
- **Empathetic Quick Reactions:**
  - 💙 *You're Not Alone*
  - 🫂 *Sending Warmth*
  - ✨ *Strength*
  - Clicking any reaction increments its counter and displays gentle feedback.

### 3. Composing a Diary Reflection
- Triggered by the `+` button.
- **Inputs:**
  - Author handle (or Anonymous by default).
  - Reflection text (free-form venting or daily journal note).
  - Feeling tag (Optional: e.g. Grateful, Hopeful, Struggling, Overwhelmed, Calm, or none).
  - Destination: Choice between Earth location (pre-filled or selectable city/country) or Celestial destination (*Shooting Star* / *Moon*).
- **Friction-Free Venting Philosophy:** Users are **never** blocked or nagged if they choose not to select a feeling. Venting without tags is fully supported.
- If text is completely blank, a gentle prompt reminds them: *"Write a thought, a feeling, or whatever is on your mind."*

### 4. Compassionate Exit Check-In
- Triggered on page unload attempt, closing the app, or clicking the *"Not Alone"* heart icon.
- Displays a warm popup: *"Remember, you are not alone in this world. How are you feeling right now?"* with quick mood buttons and an encouraging parting message.

---

## States and Boundaries

- **First Use / Cold Start:** The globe loads immediately populated with authentic sample entries across continents and celestial stars, so the world feels vibrant, welcoming, and alive on arrival.
- **Single-Entry Author State:** Mascot illustration indicating the start of their journey.
- **Local Persistence:** Newly submitted user entries and reaction counts are saved in browser local storage so the user's pins persist across page refreshes.
- **Input Error State:** Submitting completely empty text gently highlights the text box without angry red error banners.

---

## Product Decisions

- **Globe-First Architecture:** The 3D globe remains the living anchor rather than navigating to isolated separate pages.
- **Friction-Free Posting:** Feelings/ratings are strictly optional. As the learner articulated: forcing users to classify feelings when they are in distress causes frustration; venting without tags must always be permitted.
- **Mascot for First Entries:** A warm cartoonish mascot greets single-entry timelines to turn empty space into a comforting encouragement.
- **Celestial Venting (Shooting Stars / Moon):** Giving users the option to cast a heavy feeling or wish into space provides emotional relief and visual delight.

---

## What We're Building (Proof of Concept)
1. 3D Interactive WebGL Globe with smooth rotation and zoom controls.
2. Daytime (paper/earth) and Nighttime (midnight/glowing) theme modes with toggle.
3. Live mood pins on Earth + clickable celestial Shooting Star & Moon markers.
4. Author Diary Card with chronological personal timeline and single-entry mascot state.
5. Quick empathetic reaction buttons with live counter updates.
6. Friction-free `+` Composer modal supporting optional feelings and celestial/earth destinations.
7. Gentle "You Are Not Alone" check-in modal.
8. Rich seed dataset of realistic reflections from around the world.

---

## Deferred From the POC
- **AI NLP Full-Day Text Splitting:** Parsing full-day paragraphs into distinct timeline moments with auto-extracted keywords.
- **Directed `@tagging` Review System:** Admin and doctor review queues for `@country` or `@doctor` requests.
- **Live Multi-User GPS Streaming:** Real-time socket clustering and exact device GPS triangulation.
- **Account Profiles & Cloud Auth:** Logging in with passwords/OAuth (kept local for POC).

---

## Non-Goals
- Real-money payment gateways or virtual point economy.
- Calendar appointment booking with clinicians.
- Heavy social feed algorithms or follower counts (to keep the space authentic, quiet, and healing).

---

## Open Questions
None blocking development. All core behaviors, states, and visual themes are well-defined.
