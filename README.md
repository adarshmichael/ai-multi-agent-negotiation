# NegoSim — AI-Driven Multi-Agent Negotiation Training Platform

> Train your negotiation skills against advanced AI agents in hyper-realistic simulations powered by Google Gemini.

?? **Live Demo:** [adarshmichael.github.io/ai-multi-agent-negotiation/app.html](https://adarshmichael.github.io/ai-multi-agent-negotiation/app.html)
?? **Backend API:** [negosim-backend.onrender.com](https://negosim-backend.onrender.com)

---

## ? Features

- **4-Screen Negotiation Workflow** — Scenario Selection ? Agent Configuration ? Goals Summary ? Live Negotiation
- **3 Negotiation Modes** — Practice (Human vs AI), Watch (AI vs AI), Mentor (AI-guided)
- **Live Multi-Agent Chat** — Real-time WebSocket negotiation between two Gemini-powered agents
- **Orchestrator Controls** — Pause, Resume, Stop, and Reset live negotiations
- **AI Coach** — Get AI-generated hints and coaching during live negotiations
- **Performance Dashboard** — Visual scoring, trend analysis, and session history
- **Session History** — Browse, filter, and replay past negotiations
- **Analytics Charts** — Outcomes over time, satisfaction per scenario, personality insights
- **Custom Scenario Builder** — Create your own negotiation scenarios
- **Light Theme UI** — Fernly-style forest-green tinted design system
- **GSAP Animations** — Smooth screen transitions and micro-animations
- **Collapsible Sidebar** — Toggle with persistence via localStorage

---

## ?? Architecture

```
+-------------------------+         +------------------------------+
¦  GitHub Pages (Frontend)¦  HTTP / ¦  Render.com (Backend)         ¦
¦  index.html (Login)     ¦?-------?¦  Node.js + Express            ¦
¦  app.html   (Main App)  ¦  WS     ¦  Google Gemini API            ¦
¦  Vanilla HTML/CSS/JS    ¦         ¦  MongoDB Atlas (optional)      ¦
+-------------------------+         +------------------------------+
```

- **Frontend**: Static HTML/CSS/JS on GitHub Pages. No build step.
- **Backend**: Node.js/Express on Render. Handles AI calls, WebSocket, session persistence.
- **Database**: MongoDB Atlas (optional — app works without it, sessions just won't persist).

---

## ?? Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML5, CSS3, JavaScript (ES6+) |
| Animations | GSAP 3.12 |
| Backend | Node.js, Express, WebSocket (`ws`) |
| AI Engine | Google Gemini API |
| Database | MongoDB + Mongoose (optional) |
| Auth | JWT + Google OAuth (optional) |
| Hosting | GitHub Pages (frontend) + Render (backend) |

---

## ?? Changelog

### v2.0 — UI Redesign & Bug Fixes (Oct 2026)

#### ?? UI / Design
- **Light Theme Redesign**: Switched to Fernly-style forest-green light theme. Updated CSS tokens in `base.css` and `theme.css`.
- **GSAP Animations**: Added smooth screen transitions via `js/motion.js`.
- **Live Clock Widget**: Real-time clock in the sidebar footer.
- **Login Page Redesign**: `css/auth.css` updated to match new light theme.

#### ?? Bug Fixes
- **Sidebar Collapsed Bug**: Sidebar was stuck collapsed. Fixed by moving toggle to topbar as a persistent hamburger button. State saved/restored via `localStorage`.
- **Sidebar Text Overlap**: Group labels now fade out correctly when collapsed.
- **New Negotiation State Leak**: Starting a new negotiation now fully resets chat log, equilibrium panels, and WebSocket.
- **Pause/Resume Buttons**: Clicking now instantly updates UI without waiting for WebSocket event.
- **Search Bar**: Topbar search now filters scenario cards in real-time.
- **Analytics Alignment**: Fixed "Outcomes Over Time" bar chart label overlap (coerced values to `Number()`).

#### ?? Backend Fixes
- **Mongo Fail-Fast**: Added `serverSelectionTimeoutMS: 2000` to Mongoose connect.
- **DB-Disconnected Graceful Degradation**: `getSessions`, `getDashboardData`, `getAnalytics` check DB state and return empty arrays if offline.
- **Frontend Timeout**: Added `AbortController` 5s timeout to `SessionService._get()`.

#### ?? API / Connectivity
- **Dynamic Backend URL**: `api.js` auto-detects localhost vs Render deployment.
- **CORS**: Backend uses `origin: '*'` to allow GitHub Pages requests.

---

## ?? Local Development

### 1. Clone and install
```bash
git clone https://github.com/adarshmichael/ai-multi-agent-negotiation.git
cd ai-multi-agent-negotiation/backend
npm install
```

### 2. Create `backend/.env`
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=8001
MAX_ROUNDS=10
THINK_DELAY_MS=2000
NODE_ENV=development
# MONGODB_URI=mongodb://localhost:27017/negosim  (optional)
# JWT_SECRET=your_jwt_secret_here               (optional)
```

### 3. Run
```bash
npm run dev        # backend on http://localhost:8001
# then open index.html in browser
```

---

## ?? Deployment

### Frontend ? GitHub Pages
1. Push to `main` branch
2. **Settings ? Pages** ? Source: `main`, root `/`
3. Live at `https://<username>.github.io/<repo>/app.html`

### Backend ? Render
1. **New Web Service** ? connect GitHub repo
2. **Root Directory**: `backend`
3. **Build**: `npm install` | **Start**: `npm start`
4. Add Environment Variables (see below)

> ?? Free tier Render services spin down after 15 min inactivity. First request may take 30–60s.

---

## ?? Environment Variables (Render Dashboard)

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ? Yes | Primary Google Gemini API key |
| `GEMINI_API_KEYS` | Optional | Comma-separated keys for rotation |
| `PORT` | Auto | Set by Render automatically |
| `MAX_ROUNDS` | Optional | Max negotiation rounds (default: 10) |
| `THINK_DELAY_MS` | Optional | Delay between AI turns ms (default: 2000) |
| `NODE_ENV` | Optional | Set to `production` on Render |
| `MONGODB_URI` | Optional | MongoDB Atlas URI for session persistence |
| `JWT_SECRET` | Optional | JWT secret for auth tokens |

> ?? Without `MONGODB_URI` the app runs fully but session history/dashboard won't persist.

---

## ?? Project Structure

```
ai-multi-agent-negotiation/
+-- index.html              # Login page
+-- app.html                # Main app shell
+-- css/
¦   +-- style.css           # CSS entry (imports all)
¦   +-- base.css            # Tokens & reset
¦   +-- theme.css           # Sidebar, topbar, screens
¦   +-- auth.css            # Login styles
¦   +-- ...
+-- js/
¦   +-- app.js              # Main controller
¦   +-- motion.js           # GSAP animations
¦   +-- data/api.js         # HTTP + WebSocket client
¦   +-- state/appState.js   # Global state machine
¦   +-- screens/            # Per-screen JS modules
+-- backend/
    +-- server.js           # Express + WebSocket
    +-- engine/             # Negotiation engine
    +-- services/           # Business logic
    +-- controllers/        # Route handlers
    +-- models/             # Mongoose schemas
    +-- routes/             # Express routers
```

---

*Built with ?? for the Infosys Springboard AI project.*
