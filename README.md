# 🌍 The Globe Diary

> **You are not alone in this world.**

An interactive global 3D diary and emotional solidarity web application where people record their reflections across Earth, the Moon, and Shooting Stars, discovering shared human experience across time and space.

Built for the **Devpost Learn: Build With AI Basics** hackathon.

---

## ✨ Features

- **Living 3D Earth Globe:** Real-time solar terminator shader blending daylit continents with nighttime city lights using real UTC sun angles.
- **Three Celestial Domains:**
  - **🌍 Earth:** Explore reflections geographically with micro-spiral density dispersion for crowded cities.
  - **🌕 Moon:** Zoom into the lunar surface and read whispered wishes resting as glowing crystals on craters.
  - **💫 Stars:** View aerodynamic shooting star comets gliding across space with radiant tails.
- **📥 Journal Import (AI):** Paste a plain-text journal and it is automatically split into individual days/moments by **Firebase AI Logic (Gemini)**. Every proposed moment is editable before saving, and each one is labelled with the engine that produced it. If the model is unavailable, a **deterministic fallback splitter** takes over — the feature never hard-fails.
- **🕊️ Community Review Queue:** Choose a trusted reader (a **doctor**, **someone not alone**, or an **admin**) when you compose a reflection. Reviewers see a private queue, can reply, and resolve the request. Replies stay private between author and reviewer.
- **Author Journey Timeline:** Read personal chronological reflections and meet our journal mascot (*"Their journey starts here"*) on single-entry profiles.
- **Empathetic Reactions:** Send silent, one-tap support (💙 *"You're Not Alone"*, 🫂 *"Sending Warmth"*, ✨ *"Strength"*).
- **Friction-Free Venting Composer (`+`):** Record thoughts freely with optional feeling tags; destinations include Earth cities, Moon whispers, or Shooting Stars.
- **"📍 My Location" & Check-In:** Instantly re-orient to your detected location, and access a gentle check-in prompt reminding you that you are never alone.
- **Cloud Sync & Real-Time Updates:** Reflections persist to **Cloud Firestore** and stream live to every signed-in device.

---

## 🔐 Accounts

Sign-in is required to write — reflections are owned by your account and synced in real time.

- ✅ **Google** sign-in
- ✅ **Email / password** sign-up and sign-in
- 🔑 **Forgot password?** Email users can request a reset link straight from the sign-in dialog. The link is configured to return them to the app itself rather than `firebaseapp.com`, and the confirmation is deliberately neutral so the form can't be used to discover which emails have accounts.
- 🚫 **Anonymous sign-in is disabled** by design — every entry belongs to a real, recoverable account.

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- A Firebase project (Firestore + Authentication + AI Logic)

### Setup & Run Locally

```bash
# Clone the repository
git clone https://github.com/ressanoid/The-Globe-Diary-App.git
cd The-Globe-Diary-App

# Install dependencies
npm install

# Configure the environment (see below)
cp .env.example .env   # then fill in your Firebase web config

# Start the development server
npm run dev
```

Open `http://localhost:5173/` in your browser.

### Configuration

The app reads its Firebase web config from Vite environment variables. Copy `.env.example` to `.env` and fill in the values from **Firebase Console → Project settings → Your apps → Web app**:

| Variable | Purpose |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain (`<project>.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | Firestore / project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Cloud Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Web app ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | Analytics measurement ID |

> Without a config the app still runs against a **local seed state**, so the UI is fully explorable offline.

### Firebase Setup

1. **Authentication** — enable **Email/Password** and **Google**, and **leave Anonymous disabled**.
2. **Firestore** — create the default database, then deploy the security rules:
   ```bash
   npx firebase-tools deploy --only firestore:rules --project <your-project-id>
   ```
3. **AI Logic (optional)** — provision Gemini for the project to enable AI journal splitting. Without it, the deterministic fallback splitter is used instead.
4. Add any custom domains to **Authentication → Settings → Authorized domains**.

---

## 📜 Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Preview the production build |
| `npm test` | Unit tests (Vitest) — day-splitting and store logic |
| `npm run e2e` | End-to-end browser suite (Playwright) against a running dev server |
| `npm run verify:rules` | Exercises the deployed Firestore rules against a live project |
| `npm run cleanup:e2e` | Removes test entries, test accounts, and seeded reviewer docs |
| `npm run seed:reviewer <email> <role>` | Grants a real account reviewer access (`doctor` \| `notAlone` \| `admin`) |
| `npm run probe:ai` | Checks that Firebase AI Logic responds |
| `npm run probe:google` | Diagnoses Google sign-in |
| `npm run probe:auth-ui` | Diagnoses the auth UI state |

The `test`, `e2e`, and `verify:rules` suites all pass against the live project.

> The E2E suite creates throwaway `e2e-<timestamp>@example.com` accounts and a test reviewer doc. Run `npm run cleanup:e2e` afterwards to remove them.

---

## 🛠️ Tech Stack

- **Bundler & Dev Server:** [Vite](https://vitejs.dev/)
- **3D Graphics Engine:** [Three.js](https://threejs.org/) + WebGL
- **Styling:** Modern CSS3 with Custom Properties & Glassmorphism
- **Backend:** [Firebase](https://firebase.google.com/) — Cloud Firestore (realtime), Firebase Authentication, Firebase AI Logic (Gemini)
- **Testing:** [Vitest](https://vitest.dev/) (unit) and [Playwright](https://playwright.dev/) (E2E)
- **NASA Assets:** Blue Marble & Earth City Lights planetary textures

---

## 📁 Project Structure

```
index.html            App shell (canvas mount, modals, favicon)
src/
  main.js             Bootstrap, auth gate, reconnect loop
  ui.js               All UI: globe overlays, composer, import, review queue
  store.js            DataStore — Firestore-backed with a local fallback
  auth.js             Auth flows (email/password + Google)
  ai.js               Journal day-splitting (Gemini + heuristic fallback)
  import.js           Import parsing and saving
  import.test.js      Unit tests for the splitter
  style.css           Theme and component styles
  assets/             Logo and favicon assets
scripts/
  e2e.mjs             Playwright end-to-end suite
  verify-firestore.mjs  Firestore rules verification
  cleanup-e2e.mjs     Test data cleanup
  seed-reviewer.mjs   Grant reviewer roles
firestore.rules       Security rules (deployed)
```

---

## 📄 License

Released for the Devpost *Learn: Build With AI Basics* hackathon. NASA imagery is in the public domain.
