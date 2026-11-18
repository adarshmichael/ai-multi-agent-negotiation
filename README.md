# NegoSim — AI-Driven Multi-Agent Negotiation Training Platform

> Train your negotiation skills against advanced AI agents in hyper-realistic simulations powered by Google Gemini.

- 🌐 **Live Demo:** [https://adarshmichael.github.io/ai-multi-agent-negotiation/app.html](https://adarshmichael.github.io/ai-multi-agent-negotiation/app.html)
- 🚀 **Backend API:** [https://negosim-backend.onrender.com](https://negosim-backend.onrender.com)
- 📋 **Agile Documentation:** [Agile-Documentation/](Agile-Documentation/) | [Product Backlog](Agile-Documentation/PRODUCT_BACKLOG.md) | [Sprint Plans](Agile-Documentation/SPRINT_PLAN_AND_RETROSPECTIVE.md)
- 📖 **Architecture Specs:** [docs/](docs/)

---

## 👥 Team Members & Infosys Springboard Details

| Name | Role | Responsibilities | Email / GitHub |
| :--- | :--- | :--- | :--- |
| **Arun M** | Full-Stack & Engine Lead | Core Negotiation Engine, WebSocket Streaming, Gemini Integration, UI Components | [arunanbu0480@gmail.com](mailto:arunanbu0480@gmail.com) |
| **Adarsha Sigirevu** | Agile Lead & QA | Agile Tracking, User Stories, Integration Testing, Scenario Design | [adarshmichael7@gmail.com](mailto:adarshmichael7@gmail.com) |
| **Boddu Anusha** | Frontend & Documentation | MIT License, Agile Documentation, Accessibility, UI Verification | [bodduanusha04@gmail.com](mailto:bodduanusha04@gmail.com) |

---

## 📸 Screenshots & UI Walkthrough

| 4-Screen Configuration Wizard | Live Multi-Agent Arena |
| :---: | :---: |
| *Step 1–3: Scenario, Personality & Goal Selection* | *Step 4: Real-time dialogue, offers, and AI reasoning* |

| Performance Dashboard & History | AI Strategy Coach |
| :---: | :---: |
| *Session outcomes, satisfaction rates, and trend analytics* | *Post-session tactical advice and counteroffer critique* |

---

## ✨ Features

- **4-Screen Negotiation Workflow** — Scenario Selection → Agent Configuration → Goals Summary → Live Negotiation.
- **3 Negotiation Modes**:
  - *Simulation Mode*: Autonomous AI vs. AI deliberation.
  - *Practice Mode*: Interactive Human vs. AI turn-taking.
  - *Mentor Mode*: AI-guided negotiation coach providing real-time strategic hints.
- **Live Multi-Agent Chat** — Real-time WebSocket streaming of dialogue, offer prices, and underlying LLM reasoning parameters.
- **Concession Tracking Engine (Module 4)** — Deterministic concession velocity models guarding against erratic reversals and protecting reservation floors.
- **Deterministic Offer Evaluation (Module 1 & 3)** — Instant convergence tolerance detection (auto-agreement when offers converge within 2%) and counteroffer clamping.
- **Performance Scoring & Analytics** — Outcome tracking, deal efficiency metrics, satisfaction per scenario, and personality insights.
- **AI Coach & Session History** — Review, filter, replay, and export past sessions as JSON or PDF transcripts.
- **Custom Scenario Builder** — Form to build and save bespoke multi-issue negotiation scenarios.
- **Offline Graceful Degradation** — Platform operates completely in-memory without external database setup. Evaluators can enter via **Guest Demo Mode** with one click.

---

## 🏗️ Architecture

```
+-----------------------------------+         +------------------------------------+
|     GitHub Pages (Frontend)       |  HTTP / |        Render.com (Backend)        |
|  index.html (Auth & Guest Mode)   |<------->|  Node.js + Express 4.19            |
|  app.html   (Main Simulation App) |   WS    |  WebSocket Server (ws 8.18)        |
|  Vanilla HTML5 / CSS3 / ES6 JS    |         |  Google Gemini API                 |
+-----------------------------------+         |  MongoDB Atlas / In-Memory Store   |
                                              +------------------------------------+
```

- **Frontend**: Zero-build Vanilla HTML5/CSS3/JavaScript hosted on GitHub Pages.
- **Backend**: Express HTTP and WebSocket server running on Render (port 8001 locally).
- **AI Engine**: Google Gemini API (`@google/generative-ai` 0.21) with automatic multi-key rotation and heuristic fallback.
- **Database**: Dual-mode persistence — MongoDB Atlas with automatic in-memory fallback for offline zero-configuration evaluation.

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES6+) | Core user interface with zero build dependencies |
| **Animations** | GSAP 3.12 | Smooth screen transitions and micro-interactions |
| **Backend** | Node.js (>=18), Express 4.19 | REST API endpoints, routing, error handling |
| **Real-Time** | WebSocket (`ws` 8.18) | Low-latency duplex streaming of turns and reasoning |
| **AI / LLM** | Google Gemini API (`@google/generative-ai`) | Dynamic contextual agent reasoning |..
| **Database** | MongoDB Atlas + Mongoose 9 (Optional) | User account security & persistent session history |
| **Security** | bcryptjs, jsonwebtoken, helmet, express-rate-limit | Password hashing, JWT auth, rate limiting |

---

## 📁 Repository Structure

```
ai-multi-agent-negotiation/
├── index.html                 # Login page with Guest Demo Mode & offline fallback
├── app.html                   # Main simulation shell (Arena, Wizard, Analytics, Coach)
├── LICENSE                    # MIT License (2026 Arun M, Adarsha Sigirevu, Boddu Anusha)
├── README.md                  # Comprehensive project documentation
├── .gitignore                 # Root gitignore (ignoring node_modules, .env, secrets)
├── css/                       # Modular CSS stylesheets (imported via style.css)
│   ├── base.css               # Design tokens, typography, CSS reset
│   ├── theme.css              # Dark/Light theme tokens, topbar, and sidebar styles
│   ├── layout.css             # 3-column arena grid layout
│   ├── negotiation.css        # Chat timeline, dialogue bubbles, and offer cards
│   ├── reasoning.css          # AI reasoning panel and parameters grid
│   ├── components.css         # Buttons, cards, and mountable widgets
│   └── style.css              # Main CSS entry point
├── js/                        # Client-side architecture
│   ├── app.js                 # App controller and wizard coordinator
│   ├── config.js              # Environment-aware API/WS URL configuration
│   ├── motion.js              # GSAP screen animation controllers
│   ├── data/api.js            # HTTP and WebSocket communication client
│   ├── data/scenarios.js      # Built-in negotiation scenario definitions
│   ├── state/appState.js      # Reactive client state management
│   ├── screens/               # Screen coordinators (Live negotiation, History, Coach)
│   └── components/            # UI components (Timeline, Conversation Log, State Panel)
├── backend/                   # Node.js backend
│   ├── server.js              # Express + WebSocket server entry point
│   ├── package.json           # Backend dependencies and automated test scripts
│   ├── .env.example           # Environment template (Gemini, Mongo, Port)
│   ├── engine/                # Autonomous turn-taking loop (NegotiationEngine.js)
│   ├── services/              # Business logic (Concession, Counteroffer, Evaluation, LLM)
│   ├── controllers/           # HTTP route controllers
│   ├── models/                # Mongoose models with in-memory degradation
│   ├── routes/                # Express router definitions
│   └── tests/                 # Automated unit and integration test suites
├── Agile-Documentation/       # Agile project management artifacts
│   ├── PRODUCT_BACKLOG.md     # Epics, User Stories, Story Points, Acceptance Criteria
│   ├── SPRINT_PLAN_AND_RETROSPECTIVE.md # 4-Sprint plans, reviews, and retrospectives
│   ├── NegoSim_Team1_Agile_Tracker.xlsx # Sprint-level Excel tracker
│   └── Team-1_Agile_Document.xlsx       # Detailed team Excel document
└── docs/                      # Architectural specifications & wireframes
```

---

## 🚀 Local Development & Testing

### 1. Clone the repository
```bash
git clone https://github.com/adarshmichael/ai-multi-agent-negotiation.git
cd ai-multi-agent-negotiation
```

### 2. Install backend dependencies
```bash
cd backend
npm install
```

### 3. Run automated tests
```bash
npm test
```
All four test suites will execute and pass:
- `concessionTracking.test.js`: 26/26 tests passing
- `counteroffer.test.js`: 12/12 tests passing
- `offerEvaluation.test.js`: 7/7 tests passing
- `integrationEngine.test.js`: Full autonomous engine end-to-end passing

### 4. Start the backend server
```bash
npm start
```
The server will start on `http://localhost:8001` (`ws://localhost:8001`).

### 5. Launch the frontend
- **Option A (VS Code Live Server)**: Right-click `index.html` and click **"Open with Live Server"** (configured on port `5501`).
- **Option B (Direct Browser)**: Double-click `index.html` to open it in your browser.
- Click **"Continue as Guest (Offline Demo)"** for instant one-click access without requiring a database.

---

## 🔐 Environment Variables (`backend/.env`)

| Variable | Required | Description |
| :--- | :---: | :--- |
| `GEMINI_API_KEY` | Optional | Google Gemini API key (from [AI Studio](https://aistudio.google.com)). If omitted, Mock Mode runs automatically. |
| `PORT` | Optional | Server port (default: `8001`). |
| `MAX_ROUNDS` | Optional | Maximum negotiation rounds (default: `10`). |
| `THINK_DELAY_MS` | Optional | Turn delay between AI responses (default: `2000`). |
| `MONGODB_URI` | Optional | MongoDB Atlas connection string. If omitted, in-memory storage activates. |
| `JWT_SECRET` | Optional | Secret key for JWT session tokens. |

---

*Built with ❤️ for the Infosys Springboard AI Internship Program.*
