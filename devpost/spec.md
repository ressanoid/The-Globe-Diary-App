---
doc: spec
status: approved
---

# The Globe Diary — Technical Specification

A browser-based interactive 3D WebGL globe and emotional diary connection application.

---

## How This Works, In Plain Language

The application is built around three lightweight, coordinated pieces running locally in the browser:

1. **The 3D Scene Engine (`globe.js`):** Uses Three.js to render a smooth 3D Earth globe that users can freely rotate and zoom with mouse or touch. It renders glowing 3D pin markers on Earth and celestial markers (Shooting Stars and the Moon) floating in space. It detects when a user clicks a pin or star using 3D raycasting.
2. **The App & UI Controller (`app.js` & `ui.js`):** Handles user interactions: toggling between Daylight (earthy paper journal) and Nighttime (midnight cosmos) themes, opening the Author Diary & Timeline modal, displaying the mascot for first entries, handling emotional reaction clicks, and managing the `+` Reflection Composer and the compassionate Check-In prompt.
3. **The Local Data Store (`store.js`):** Houses the pre-seeded global diary reflections and user-created entries in browser `localStorage`. When a user writes a diary entry or taps a reaction, the store updates immediately and signals the 3D scene to drop the new pin live.

---

## The Core Journey Through the System

1. **Launch:** The user runs `npm run dev` and opens the local URL. `app.js` initializes `store.js` (loading seeded global entries or saved `localStorage` data) and starts `globe.js`.
2. **Explore:** The user drags the globe. `globe.js` spins the sphere smoothly and positions pins at calculated 3D coordinates from latitude/longitude.
3. **Inspect Pin:** Clicking a pin triggers a raycast hit in `globe.js`, passing the entry ID to `ui.js`. `ui.js` queries `store.js` for that author's reflections, builds the chronological timeline, checks if the author has only 1 entry (triggering the mascot illustration state), and opens the modal.
4. **React:** Tapping 💙 *"You're Not Alone"* updates the reaction count in `store.js`, persists it to `localStorage`, and updates the counter on screen.
5. **Create Entry:** Clicking `+` opens the composer. Submitting validates that text is not empty (feeling remains strictly optional per product requirements), generates a new record in `store.js`, and instructs `globe.js` to animate a new pin dropping onto Earth or lighting up as a Shooting Star in the sky.
6. **Check-In:** Triggering the "Not Alone" action displays the compassionate check-in modal.

---

## Stack

- **Runtime & Bundler:** [Vite](https://vitejs.dev/) — instantaneous local development, zero configuration, fast build.
- **3D Graphics Engine:** [Three.js](https://threejs.org/) — high-performance WebGL 3D rendering for spheres, textures, pin meshes, raycasting, and smooth orbit controls.
- **Languages:** Standard Modern JavaScript (ES Modules), HTML5, Vanilla CSS3 (Custom Properties for dynamic Day/Night transitions).
- **State & Persistence:** Browser `localStorage` with reactive helper module.
- **Asset / Textures:** Procedural textures + SVG assets for globe landmasses and celestial markers (fully self-contained, no external network dependencies).

---

## Where It Runs and How Someone Tries It

- **Runtime:** Any modern web browser with WebGL support (Chrome, Safari, Firefox, Edge).
- **Node environment:** Node.js 18+.
- **How to run:**
  ```bash
  npm install
  npm run dev
  ```
  Open `http://localhost:5173/` in the browser.
- **Submission Requirements:** A short 60-second screen recording demo video and public GitHub repository.

---

## Look and Feel

Implements `prd.md > Look and Feel`:
- **Day Mode Palette:** Warm parchment `#FBF8F1`, soft earthy sage `#5B7065`, terracotta accents `#C86D51`, charcoal text `#2C302E`.
- **Night Mode Palette:** Midnight space `#090D16`, deep indigo `#121829`, glowing cyan pins `#00F0FF`, warm amber `#FFB347`, soft violet `#A78BFA`.
- **Typography:** Humanistic, compassionate sans-serif font pairing (`Inter` / system-ui fallback), clean rounded card dialogs (`border-radius: 16px`), and soft backdrop blur (`backdrop-filter: blur(12px)`).
- **Micro-animations:** Subtle pin pulse, smooth 3D globe inertia, gentle modal fade-ins.

---

## Components

### 1. `GlobeScene` (`src/globe.js`)
- Implements `prd.md > Interactive 3D Globe & Celestial Space`.
- Manages Three.js scene, camera, WebGL renderer, ambient & directional lighting, and OrbitControls.
- Generates 3D sphere with Earth map textures.
- Renders pins at `(lat, lng) -> (x, y, z)` spherical coordinates.
- Renders celestial objects (Moon mesh and shooting star particles).
- Emits `onPinClick(entryId)` via Three.js Raycaster.

### 2. `DataStore` (`src/store.js`)
- Implements `prd.md > States and Boundaries`.
- Pre-seeded dataset with realistic reflections across continents (Tokyo, Cairo, London, São Paulo, New York, etc.) and celestial wishes.
- Manages `entries` array, `addEntry()`, `addReaction()`, and `getAuthorTimeline(author)`.
- Persists user modifications into `localStorage`.

### 3. `UIManager` (`src/ui.js`)
- Implements `prd.md > Features and Behavior`.
- Controls Day/Night theme toggling via `document.body` dataset.
- Renders the **Author Diary & Journey Timeline** modal.
- Renders the cartoonish mascot state when an author has only 1 entry (*"Their journey starts here"*).
- Renders and validates the **`+` Reflection Composer** (feeling strictly optional).
- Renders the **Compassionate Exit Check-In** prompt.

### 4. `Main Controller` (`src/main.js`)
- Wires `DataStore`, `GlobeScene`, and `UIManager` together on application mount.

---

## Data Model

```typescript
interface DiaryEntry {
  id: string;               // Unique ID, e.g. "entry_172858..."
  author: string;           // Display handle or "Anonymous"
  text: string;             // Reflection / venting content
  feeling?: string;         // Optional: "Hopeful" | "Struggling" | "Peaceful" | "Grateful" | "Overwhelmed" | ""
  destination: "earth" | "shooting-star" | "moon";
  locationName: string;     // e.g. "Tokyo, Japan" or "Cosmic Orbit"
  lat: number | null;       // Latitude (null for celestial)
  lng: number | null;       // Longitude (null for celestial)
  timestamp: string;        // ISO 8601 string
  reactions: {
    notAlone: number;       // 💙 You're not alone
    warmth: number;         // 🫂 Sending warmth
    strength: number;       // ✨ Strength
  };
}
```

---

## File Structure

```
TheGlobeApp/
├── index.html              # Main HTML entry with canvas and UI overlay mounts
├── package.json            # Vite & Three.js dependencies
├── src/
│   ├── main.js             # Application entry point & coordination
│   ├── globe.js            # Three.js 3D globe, celestial bodies & raycasting
│   ├── store.js            # Seed data, localStorage persistence & CRUD operations
│   ├── ui.js               # Modal dialogs, timeline renderer, reactions & theme toggle
│   ├── style.css           # Modern styles, Day/Night variables & responsive layout
│   └── assets/             # Earth texture & mascot illustration SVG
├── devpost/                # Devpost hackathon documentation
│   ├── learner-profile.md
│   ├── scope.md
│   ├── prd.md
│   └── spec.md
└── .gitignore
```

---

## Important Failure Modes

- **WebGL Unsupported or Hardware Acceleration Disabled:**
  - Fallback message overlay explaining WebGL is needed with a graceful 2D map/timeline view fallback.
- **Local Storage Corrupted or Disabled (Private Browsing):**
  - Store falls back gracefully to in-memory array so the session continues uninterrupted.
- **Empty Reflection Text Submission:**
  - Gentle visual cue on the text area without blocking red alerts or reprimands.

---

## What Was Simplified and Why

- **Client-Side `localStorage` instead of Serverpod backend database:** Sized directly for the hackathon proof of concept so it can run 100% locally with zero server configuration or database migrations, while remaining trivially upgradable to a full backend later.
- **Built-in Procedural / SVG Earth Map instead of dynamic tile servers:** Ensures instant loading, works completely offline, and eliminates API keys or map quota limits.

---

## Decisions and Open Issues

- **Stack Agreement:** Agreed on Vite + Three.js + Vanilla JS/CSS for ultra-smooth 60 FPS 3D interaction and zero-friction hackathon demonstration.
- **Learner Understanding:** As the learner is new to working with AI agents, the build will proceed in clean, verifiable steps where each component is tested in the browser.
