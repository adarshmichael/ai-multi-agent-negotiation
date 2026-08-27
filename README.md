# NegoSim — Multi-Agent Negotiation Training & Simulation Platform

## 1. Project Overview

This project is an AI-driven multi-agent negotiation platform where multiple LLM-powered agents represent different stakeholders. Each agent has its own role, goals, constraints, and negotiation personality.

The platform supports two modes:

- **Simulation Mode:** AI agents negotiate with each other while the user observes the transcript, offers, concessions, and metrics.
- **Practice Mode:** A human participates as one negotiating party against AI agents and receives feedback on the negotiation outcome.

An **Orchestrator Agent** manages turn-taking, passes the current state and history to the active party, tracks rounds and concessions, detects deadlocks, and starts outcome reporting.

## 2. System Workflow

```mermaid
flowchart TD
	A[Scenario Selection] --> B[Agent Configuration]
	B --> C[Negotiation Starts]
	C --> D[Orchestrator Selects Agent Turn]
	D --> E[Agent Generates Offer / Counteroffer]
	E --> F[Other Agent Evaluates]
	F --> G{Accept / Reject / Counteroffer}
	G -->|Accept| H[Validate Agreement]
	G -->|Reject| I[Check Deadlock]
	G -->|Counteroffer| D
	H -->|Valid| J[Negotiation Ends]
	H -->|Invalid| I
	I -->|Continue| D
	I -->|Breakdown| J
	J --> K[Outcome Report]
```

For the detailed round-by-round sequence, orchestrator state machine, deadlock handling, and mode flow, see [docs/system-workflow.md](docs/system-workflow.md).

## 3. Agent Personas

The initial demonstration uses two parties:

- **Buyer:** Company Purchasing Manager; seeks the lowest possible price; maximum budget ₹8,00,000; risk-averse.
- **Vendor:** Vendor/Sales Representative; seeks maximum profit and a closed deal; minimum acceptable price ₹7,00,000; aggressive.

See [docs/agent-personas.md](docs/agent-personas.md) for full persona behavior, decision rules, and personality profiles.

## 4. Selected Negotiation Scenario

The first scenario is **Vendor Pricing Negotiation**. The Buyer negotiates to purchase products within budget, while the Vendor protects its minimum acceptable price and attempts to maximize profit.

See [docs/negotiation-scenario.md](docs/negotiation-scenario.md) for objectives, constraints, terms, an example exchange, agreement validation, and the three-scenario catalogue.

---

## Milestone 1 Scope
Milestone 1 implements the complete **pre-negotiation setup workflow**:

1. **Scenario Selection Module** — a polished, card-based screen for choosing one of three predefined negotiation scenarios (Vendor Pricing, Job Offer, Project Budget Allocation), each with a 3D hover/tilt effect and clear selected state.
2. **Scenario Data** — all scenario and agent definitions (name, role, goal, constraint) live in a single centralized data module (`js/data/scenarios.js`), decoupled from UI logic so it can later be swapped for a backend/API call.
3. **Agent Configuration** — agent cards are generated dynamically from the selected scenario's data (never hardcoded per scenario), showing each agent's goal and constraint.
4. **Personality Selection** — each agent gets an independent personality selector (Aggressive / Collaborative / Risk-Averse), stored per-agent in centralized application state.
5. **Basic Workflow** — a 4-step flow: `Scenario Selection → Agent Configuration → Goals & Constraints Summary → Ready to Start Negotiation`, with forward/back navigation and a step indicator in the header.
6. **Validation** — the user cannot continue without selecting a scenario, and cannot proceed past agent configuration until every agent has a personality assigned; clear inline warning banners explain what's missing.

No LLM integration, offer generation, real-time negotiation, or backend/auth is implemented in this milestone — the final screen only indicates the app is "Ready to Start Negotiation" as a placeholder for the next phase.

## Technologies Used
- HTML5
- CSS3 (custom properties/design tokens, CSS Grid, 3D transforms for card tilt/depth effects)
- Clean, modern, "AI-humanized" white-color UI theme
- Vanilla JavaScript (no frameworks, no build step)

## Project Structure
```
project/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── data/
│   │   └── scenarios.js   # centralized scenario + personality data
│   ├── state/
│   │   └── appState.js    # centralized app state (selected scenario, personalities, step)
│   └── app.js              # rendering + navigation + interaction logic
└── README.md
```

## How to Run
No build step or dependencies are required.

1. Open a terminal in the `project/` folder.
2. Start any static file server, for example:
   ```bash
   python3 -m http.server 8000
   ```
3. Open `http://localhost:8000` in your browser.

(Opening `index.html` directly via `file://` also works, since the app uses only plain `<script>` tags.)

## Application State
A single `AppState` module (`js/state/appState.js`) tracks:
- `currentStep` — which of the 4 workflow steps is active
- `selectedScenarioId` — the chosen scenario
- `personalities` — a map of `agentId → personalityId`

All UI re-renders reactively whenever state changes, via a simple subscribe/notify pattern.

## 6. Backend Integration & Execution (Milestone 2)

A fully functional FastAPI backend has been integrated to power the negotiation logic via Google Gemini.

### Backend Architecture
- **FastAPI**: REST endpoints for Scenarios, Agents, and Negotiations.
- **PostgreSQL & SQLAlchemy**: Database models for persisting negotiation histories. (Configurable to SQLite for simple local testing via `.env`).
- **Orchestrator**: Manages AI turns, constraint validation (preventing agents from exceeding budgets/minimums), and simulation loops.
- **LLM Service**: Connects to the Gemini 1.5 API to generate intelligent negotiation offers/counteroffers in strict JSON schemas.

### How to Run the Backend
1. Open a terminal in the `backend/` folder.
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/Scripts/activate  # (Windows) or venv/bin/activate (Mac/Linux)
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure environment variables:
   - Create a `.env` file based on `.env.example` inside the `backend/` directory.
   - Add your `GEMINI_API_KEY`.
   - Set `DATABASE_URL=sqlite:///./negosim.db` for quick local testing, or use a PostgreSQL connection string.
5. Initialize the Database and Seed Data:
   ```bash
   python -m app.db.init_db
   ```
6. Start the FastAPI server:
   ```bash
   uvicorn app.main:app --reload --port 8001
   ```
   *The Swagger API documentation will be available at `http://localhost:8001/docs`.*

### Frontend Connection
1. In a separate terminal at the project root `d:\Infosys Springboard`, start the frontend:
   ```bash
   python -m http.server 8000
   ```
2. Open `http://localhost:8000` in your browser.
3. Select the **Vendor Pricing Negotiation** scenario, configure agent personalities, and proceed to the Summary.
4. Click **Ready to Start Negotiation**. The frontend will now call the backend to create the negotiation, trigger the AI Simulation Mode, and display the final outcome directly on the screen!

## Known Limitations
- The negotiation transcript is not yet visualized round-by-round on the UI; currently, the Simulation Mode runs automatically on the backend and returns the final outcome summary to the UI.
- Practice Mode API is built but not yet connected to a dedicated UI screen.

## Planned for Future Phases
- Real-time WebSockets or polling for round-by-round live UI updates.
- Practice Mode UI allowing the human player to submit text offers.
