/**
 * js/data/scenarios.js
 * Centralized scenario data with goal options and constraint configuration.
 * Single source of truth for all scenario + agent definitions on the frontend.
 *
 * Each agent includes:
 *   goalOptions       — suggested goals the user can select from
 *   constraintOptions — constraint options, some with numeric fields
 */

const SCENARIOS = [
  {
    id: 'vendor-pricing',
    name: 'Vendor Pricing Negotiation',
    description: 'A buyer and a vendor negotiate the price of goods or services, balancing budget limits against profit margins.',
    icon: 'cart',
    agents: [
      {
        id: 'buyer',
        name: 'Buyer',
        role: 'Customer / Buyer',
        goal: 'Get the best possible price',
        constraints: ['Limited budget', 'Must adhere to procurement policies'],
        goalOptions: [
          'Get the best possible price',
          'Maximize cost savings',
          'Close the deal quickly',
          'Build a long-term supplier relationship',
          'Ensure quality standards are met within budget',
          'Stay within quarterly procurement limits',
        ],
        constraintOptions: [
          { id: 'max-budget', label: 'Maximum Budget', hasNumeric: true, numericLabel: 'Budget Limit (₹)', numericType: 'max', defaultValue: 800000, placeholder: 'e.g. 800000' },
          { id: 'procurement-policy', label: 'Must adhere to procurement policies' },
          { id: 'quality-standard', label: 'Minimum quality standards must be maintained' },
          { id: 'delivery-timeline', label: 'Delivery timeline must be agreed upon' },
          { id: 'payment-terms', label: 'Standard payment terms required' },
        ],
        numericConstraint: { type: 'max', defaultValue: 800000 },
      },
      {
        id: 'vendor',
        name: 'Vendor',
        role: 'Seller / Vendor',
        goal: 'Maximize profit',
        constraints: ['Minimum acceptable price', 'Cannot compromise on quality terms'],
        goalOptions: [
          'Maximize profit margin',
          'Secure a long-term supply contract',
          'Meet quarterly sales targets',
          'Recover production costs with reasonable margin',
          'Establish market presence with this client',
          'Maintain quality reputation',
        ],
        constraintOptions: [
          { id: 'min-price', label: 'Minimum Acceptable Price', hasNumeric: true, numericLabel: 'Minimum Price (₹)', numericType: 'min', defaultValue: 700000, placeholder: 'e.g. 700000' },
          { id: 'quality-terms', label: 'Cannot compromise on quality terms' },
          { id: 'payment-terms', label: 'Advance or milestone payment required' },
          { id: 'volume-commitment', label: 'Requires minimum volume commitment from buyer' },
          { id: 'warranty', label: 'Standard warranty and support terms apply' },
        ],
        numericConstraint: { type: 'min', defaultValue: 700000 },
      },
    ],
  },
  {
    id: 'job-offer',
    name: 'Job Offer Negotiation',
    description: 'A candidate and an employer negotiate compensation and benefits within the constraints of a hiring budget.',
    icon: 'briefcase',
    agents: [
      {
        id: 'candidate',
        name: 'Candidate',
        role: 'Job Candidate',
        goal: 'Get the best overall compensation and benefits',
        constraints: ['Minimum acceptable compensation', 'Must include standard benefits package'],
        goalOptions: [
          'Get the best overall compensation and benefits',
          'Secure a salary that reflects market rates',
          'Negotiate strong growth opportunities',
          'Ensure work-life balance terms are included',
          'Get signing bonus or relocation support',
          'Close the deal quickly to start the new role',
        ],
        constraintOptions: [
          { id: 'min-salary', label: 'Minimum Acceptable Salary', hasNumeric: true, numericLabel: 'Minimum CTC (₹ per year)', numericType: 'min', defaultValue: 1200000, placeholder: 'e.g. 1200000' },
          { id: 'benefits', label: 'Must include standard benefits package (health, PF, etc.)' },
          { id: 'remote-option', label: 'Remote or hybrid work option required' },
          { id: 'notice-period', label: 'Notice period must align with current commitment' },
          { id: 'variable-pay', label: 'Performance-linked variable pay is acceptable' },
        ],
        numericConstraint: { type: 'min', defaultValue: 1200000 },
      },
      {
        id: 'employer',
        name: 'Employer',
        role: 'Hiring Manager / Employer',
        goal: "Hire the candidate within the company's budget",
        constraints: ['Fixed hiring budget / compensation range', 'Must comply with internal salary bands'],
        goalOptions: [
          "Hire the candidate within the company's budget",
          'Fill the role as quickly as possible',
          'Maintain internal pay equity across the team',
          'Attract and retain top talent at reasonable cost',
          'Keep compensation within approved budget bands',
          'Build a long-term employment relationship',
        ],
        constraintOptions: [
          { id: 'max-ctc', label: 'Maximum CTC (Budget Ceiling)', hasNumeric: true, numericLabel: 'Maximum CTC (₹ per year)', numericType: 'max', defaultValue: 1800000, placeholder: 'e.g. 1800000' },
          { id: 'salary-band', label: 'Must comply with internal salary bands' },
          { id: 'benefits-cap', label: 'Benefits package is fixed per company policy' },
          { id: 'notice-period', label: 'Cannot wait more than 60 days for joining' },
          { id: 'performance-review', label: 'Salary revision subject to 6-month performance review' },
        ],
        numericConstraint: { type: 'max', defaultValue: 1800000 },
      },
    ],
  },
  {
    id: 'budget-allocation',
    name: 'Project Budget Allocation',
    description: 'A project manager and a finance manager negotiate how much budget a project should receive.',
    icon: 'chart',
    agents: [
      {
        id: 'project-manager',
        name: 'Project Manager',
        role: 'Project Manager',
        goal: 'Secure enough budget to successfully complete the project',
        constraints: ['Limited overall project budget', 'Must deliver core features without compromise'],
        goalOptions: [
          'Secure enough budget to successfully complete the project',
          'Ensure all core features are funded',
          'Build in contingency for risk management',
          'Avoid scope cuts that affect project success',
          'Maintain delivery timeline with adequate resources',
          'Get approval for phased funding milestones',
        ],
        constraintOptions: [
          { id: 'min-budget', label: 'Minimum Budget Required', hasNumeric: true, numericLabel: 'Minimum Budget (₹)', numericType: 'min', defaultValue: 2000000, placeholder: 'e.g. 2000000' },
          { id: 'core-features', label: 'Core features must not be compromised' },
          { id: 'team-size', label: 'Minimum team size required for delivery' },
          { id: 'timeline', label: 'Delivery timeline cannot be extended' },
          { id: 'contingency', label: 'Contingency reserve of at least 10% required' },
        ],
        numericConstraint: { type: 'min', defaultValue: 2000000 },
      },
      {
        id: 'finance-manager',
        name: 'Finance Manager',
        role: 'Finance Manager',
        goal: 'Control spending and optimize budget allocation',
        constraints: ['Fixed organizational budget', 'Quarterly spending limits must be respected'],
        goalOptions: [
          'Control spending and optimize budget allocation',
          'Minimize budget overruns across the organization',
          'Maintain cash flow within quarterly limits',
          'Prioritize high-ROI projects',
          'Ensure compliance with financial policies',
          'Build accurate financial forecasts',
        ],
        constraintOptions: [
          { id: 'max-budget', label: 'Maximum Approved Budget', hasNumeric: true, numericLabel: 'Maximum Budget (₹)', numericType: 'max', defaultValue: 3000000, placeholder: 'e.g. 3000000' },
          { id: 'quarterly-limit', label: 'Quarterly spending limits must be respected' },
          { id: 'approval-chain', label: 'Budget above threshold requires board approval' },
          { id: 'roi-justification', label: 'ROI justification required for full allocation' },
          { id: 'audit-trail', label: 'Full audit trail and financial reporting required' },
        ],
        numericConstraint: { type: 'max', defaultValue: 3000000 },
      },
    ],
  },
];

const PERSONALITIES = [
  {
    id: 'aggressive',
    label: 'Aggressive',
    description: 'Pushes hard for maximum gain, low concession rate.',
  },
  {
    id: 'collaborative',
    label: 'Collaborative',
    description: 'Seeks win-win outcomes, values the relationship.',
  },
  {
    id: 'risk-averse',
    label: 'Risk-Averse',
    description: 'Prefers safe, predictable outcomes over big gains.',
  },
  {
    id: 'competitive',
    label: 'Competitive',
    description: 'Focuses on winning the negotiation strategically.',
  },
  {
    id: 'flexible',
    label: 'Flexible',
    description: 'Adapts strategy based on the other party\'s moves.',
  },
  {
    id: 'analytical',
    label: 'Analytical',
    description: 'Data-driven, methodical — seeks logical agreements.',
  },
  {
    id: 'professional',
    label: 'Professional',
    description: 'Maintains formality and a structured process.',
  },
];

// Expose to global scope (no build tooling / bundler in this project).
window.SCENARIOS = SCENARIOS;
window.PERSONALITIES = PERSONALITIES;
