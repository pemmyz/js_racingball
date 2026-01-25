# js_racingball

# 3D Rolling Ball Game 🎮⚽

A browser-based **3D rolling ball platformer** built with **Three.js** for rendering and **Cannon‑ES** for physics.  
Control a ball through floating platforms, moving obstacles, ramps, jumps, and collectibles — all rendered in real-time WebGL.

---

## ✨ Features

- 🎥 Smooth third-person camera following the ball  
- ⚙️ Real-time physics using Cannon‑ES  
- 🧱 Static platforms, ramps, and bridges  
- 🔄 Rotating and sliding obstacles  
- 📦 Dynamic physics boxes (smash arena)  
- 💎 Collectible credits with score counter  
- ☁️ Fog and dynamic lighting with shadows  
- ♻️ Automatic respawn when falling off the map  

---

## 🕹 Controls

| Key | Action |
|----|-------|
| **W / A / S / D** or **Arrow Keys** | Move ball |
| **Space** | Brake |
| **E** | Jump |
| **R** | Reset position |

---

## 🚀 How to Run

Because this project uses **ES Modules**, it must be served through a local web server.

### Option 1: Python (recommended)
```bash
python3 -m http.server
```
Then open:
```
http://localhost:8000
```

### Option 2: Node.js
```bash
npx serve
```

---

## 📁 Project Structure

```
/
├── index.html      # Main HTML file
├── style.css       # UI & canvas styling
├── script.js       # Game logic, rendering & physics
└── README.md       # This file
```

---

## 🔧 Technologies Used

- **Three.js** – 3D rendering  
- **Cannon‑ES** – Physics engine  
- **WebGL** – GPU-accelerated graphics  
- **JavaScript ES Modules**  
- **HTML5 / CSS3**  

CDNs are loaded via **Import Maps**, so no build step is required.

---

## 🧠 Gameplay Overview

- Start on a safe platform and collect credits
- Cross bridges and ramps
- Dodge rotating and sliding obstacles
- Time your jumps carefully
- Push dynamic boxes in the smash arena
- Reach the golden goal at the end

Falling below the level triggers a respawn.

---

## 🛠 Customization Ideas

- Procedural level generation
- Checkpoints
- Timer or speedrun mode
- Multiple balls or split‑screen
- Gamepad support
- Sound effects and music

---

## 📜 License

Free to use for learning, experimenting, and personal projects.  
Add a license if you plan to publish or distribute.

---

Have fun rolling! 🟡✨
