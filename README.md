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
- **Author Journey Timeline:** Read personal chronological reflections and meet our journal mascot (*"Their journey starts here"*) on single-entry profiles.
- **Empathetic Reactions:** Send silent, one-tap support (💙 *"You're Not Alone"*, 🫂 *"Sending Warmth"*, ✨ *"Strength"*).
- **Friction-Free Venting Composer (`+`):** Record thoughts freely with optional feeling tags; destinations include Earth cities, Moon whispers, or Shooting Stars.
- **"📍 My Location" & Check-In:** Instantly re-orient to your detected location, and access a gentle check-in prompt reminding you that you are never alone.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+

### Setup & Run Locally
```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/The-Globe-Diary-App.git
cd The-Globe-Diary-App

# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173/` in your browser.

---

## 🛠️ Tech Stack
- **Bundler & Dev Server:** [Vite](https://vitejs.dev/)
- **3D Graphics Engine:** [Three.js](https://threejs.org/) + WebGL
- **Styling:** Modern CSS3 with Custom Properties & Glassmorphism
- **Persistence:** LocalStorage API with seed state
- **NASA Assets:** Blue Marble & Earth City Lights planetary textures
