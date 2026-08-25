/**
 * Centralized scenario data.
 * This is the single source of truth for all scenario + agent definitions.
 * Designed so it can later be swapped for a backend/database fetch
 * without changing any UI code.
 */

const SCENARIOS = [
  {
    id: "vendor-pricing",
    name: "Vendor Pricing Negotiation",
    description:
      "A buyer and a vendor negotiate the price of goods or services, balancing budget limits against profit margins.",
    icon: "cart",
    agents: [
      {
        id: "buyer",
        name: "Buyer",
        role: "Customer / Buyer",
        goal: "Get the best possible price",
        constraint: "Limited budget",
      },
      {
        id: "vendor",
        name: "Vendor",
        role: "Seller / Vendor",
        goal: "Maximize profit",
        constraint: "Minimum acceptable price",
      },
    ],
  },
  {
    id: "job-offer",
    name: "Job Offer Negotiation",
    description:
      "A candidate and an employer negotiate compensation and benefits within the constraints of a hiring budget.",
    icon: "briefcase",
    agents: [
      {
        id: "candidate",
        name: "Candidate",
        role: "Job Candidate",
        goal: "Get the best overall compensation and benefits",
        constraint: "Minimum acceptable compensation",
      },
      {
        id: "employer",
        name: "Employer",
        role: "Hiring Manager / Employer",
        goal: "Hire the candidate within the company's budget",
        constraint: "Fixed hiring budget / compensation range",
      },
    ],
  },
  {
    id: "budget-allocation",
    name: "Project Budget Allocation",
    description:
      "A project manager and a finance manager negotiate how much budget a project should receive.",
    icon: "chart",
    agents: [
      {
        id: "project-manager",
        name: "Project Manager",
        role: "Project Manager",
        goal: "Secure enough budget to successfully complete the project",
        constraint: "Limited overall project budget",
      },
      {
        id: "finance-manager",
        name: "Finance Manager",
        role: "Finance Manager",
        goal: "Control spending and optimize budget allocation",
        constraint: "Fixed organizational budget",
      },
    ],
  },
];

const PERSONALITIES = [
  {
    id: "aggressive",
    label: "Aggressive",
    description: "Pushes hard for maximum gain, low concession rate.",
  },
  {
    id: "collaborative",
    label: "Collaborative",
    description: "Seeks win-win outcomes, values the relationship.",
  },
  {
    id: "risk-averse",
    label: "Risk-Averse",
    description: "Prefers safe, predictable outcomes over big gains.",
  },
];

// Expose to global scope (no build tooling / bundler in this project).
window.SCENARIOS = SCENARIOS;
window.PERSONALITIES = PERSONALITIES;
