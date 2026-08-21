# System Workflow

This document defines the end-to-end workflow for the AI-Driven Multi-Agent Negotiation Training & Simulation Platform.

## 1. End-to-End Workflow

```mermaid
flowchart TD
    A[Scenario Selection] --> B[Agent Configuration]
    B --> C{Configuration Valid?}
    C -->|No| B
    C -->|Yes| D[Initialize Negotiation State]
    D --> E[Negotiation Starts]
    E --> F[Orchestrator Selects Agent Turn]
    F --> G{Practice Mode Human Turn?}
    G -->|Yes| H[Human Submits Message or Offer]
    G -->|No| I[Agent Reads Persona, Goals, Constraints, and History]
    I --> J[LLM Generates Offer or Counteroffer]
    H --> K[Orchestrator Normalizes and Records Turn]
    J --> K
    K --> L[Other Party Evaluates Proposal]
    L --> M{Decision}
    M -->|Accept| N[Validate Agreement Terms]
    M -->|Counteroffer| O[Record Concession and Update Stance]
    M -->|Reject| P[Check Deadlock Conditions]
    N -->|Valid| Q[Agreement Reached]
    N -->|Invalid| P
    O --> P
    P -->|Continue| F
    P -->|Deadlock or Max Rounds| R[Resolution Attempt or Breakdown]
    Q --> S[Negotiation Ends]
    R --> S
    S --> T[Generate Outcome Report]
```

## 2. Detailed Round Sequence

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant UI as Configuration / Arena UI
    participant O as Orchestrator
    participant A as Active Party
    participant R as Receiving Party
    participant M as Metrics and Report Service

    U->>UI: Select scenario, mode, and agent settings
    UI->>O: Submit validated ScenarioConfig
    O->>O: Create NegotiationState and set round = 0
    O->>A: Request next turn with persona and history
    alt Simulation Mode
        A->>A: Reason over objectives, limits, risk, and history
        A-->>O: Structured offer, rationale, and requested terms
    else Practice Mode
        O-->>UI: Prompt human participant
        U->>UI: Submit message or offer
        UI-->>O: Human turn payload
    end
    O->>O: Validate format and hard constraints
    O->>R: Forward proposal and context
    R->>R: Evaluate value, feasibility, and concession cost
    R-->>O: Accept, reject, or counteroffer
    O->>M: Record turn, concession delta, stance, and metrics
    alt Accept
        O->>O: Check all agreement terms
        O-->>UI: Show agreement and end state
    else Counteroffer
        O->>O: Change turn and increment round
        O-->>UI: Stream transcript and live metrics
        O->>A: Request next turn
    else Reject or deadlock
        O->>O: Check repetition, movement, and round limits
        alt Resolution possible
            O->>A: Request final resolution proposal
        else Breakdown
            O-->>UI: Show breakdown reason
        end
    end
    O->>M: Generate terms, concessions, rounds, and satisfaction report
    M-->>UI: Display Outcome Report
```

## 3. Orchestrator State Machine

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> ScenarioSelected: scenario chosen
    ScenarioSelected --> AgentsConfigured: valid personas submitted
    AgentsConfigured --> InProgress: start negotiation
    InProgress --> AwaitingHumanInput: Practice Mode human turn
    AwaitingHumanInput --> EvaluatingProposal: human submits turn
    InProgress --> GeneratingAgentTurn: AI turn selected
    GeneratingAgentTurn --> EvaluatingProposal: offer generated
    EvaluatingProposal --> InProgress: counteroffer and rounds remain
    EvaluatingProposal --> Agreed: accepted valid terms
    EvaluatingProposal --> Deadlocked: rejection, repetition, or max rounds
    Deadlocked --> Resolution: resolution rule available
    Deadlocked --> ReportGenerated: no resolution possible
    Resolution --> Agreed: final terms accepted
    Resolution --> ReportGenerated: resolution fails
    Agreed --> ReportGenerated
    ReportGenerated --> [*]
```

## 4. Stage Definitions

| Stage | System responsibility | Output |
|---|---|---|
| Scenario Selection | Load a pre-built scenario and its default terms | `ScenarioConfig` |
| Agent Configuration | Set role, goal, hard constraint, soft constraint, and personality | `AgentPersona[]` |
| Negotiation Starts | Create the transcript, round counter, turn order, and initial metrics | `NegotiationState` |
| Turn Selection | Choose the next party and supply current context | `TurnRequest` |
| Offer Generation | Produce a structured offer or response using the LLM | `Proposal` |
| Evaluation | Compare the proposal with objectives and constraints | `Decision` |
| State Update | Record terms, concessions, stance, and metrics | Updated `NegotiationState` |
| Deadlock Handling | Detect no movement, repeated offers, impossible constraints, or max rounds | `ResolutionResult` |
| Outcome Report | Summarize terms, performance, concessions, and result | `OutcomeReport` |

## 5. Deadlock Detection and Resolution

The Orchestrator checks for deadlock after every evaluated turn:

- The maximum configured round count is reached.
- The same offer or counteroffer is repeated.
- The distance between the parties has not reduced for several turns.
- A hard constraint makes a mutually acceptable agreement impossible.
- An agent rejects a proposal without a viable alternative.

When a deadlock is detected, the system can request a final package proposal, allow a trade across soft terms, or declare a breakdown with the blocking constraint recorded.

## 6. Simulation and Practice Modes

```mermaid
flowchart LR
    O((Orchestrator))
    subgraph Simulation Mode
        A1[Buyer AI Agent] <--> O
        O <--> A2[Vendor AI Agent]
    end
    subgraph Practice Mode
        H[Human Participant] <--> O
        O <--> A3[Vendor AI Agent]
    end
    O --> T[Shared Transcript]
    O --> M[Live Metrics]
```

Both modes share the same state machine and report format. Practice Mode replaces one AI-generated turn with validated human input.
