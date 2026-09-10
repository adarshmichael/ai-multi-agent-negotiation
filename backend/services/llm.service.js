/**
 * services/llm.service.js
 * Gemini API integration for generating agent negotiation responses.
 * API key is ONLY accessed server-side via environment variables.
 *
 * Supports:
 *   - Standard AI Studio API keys (AIza...)
 *   - Alternative key formats (AQ., etc.)
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config/env');
const logger = require('../utils/logger');

// Active models supported by Gemini API in order of speed, reliability & reasoning
const MODEL_CANDIDATES = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
];

let currentKeyIndex = 0;
const genAICache = new Map();

function getGenAIInstance() {
  const keys = (config.geminiApiKeys && config.geminiApiKeys.length > 0)
    ? config.geminiApiKeys
    : (config.geminiApiKey ? [config.geminiApiKey] : []);

  if (keys.length === 0) {
    throw new Error('No GEMINI_API_KEY or GEMINI_API_KEYS configured in backend environment.');
  }

  const activeKey = keys[currentKeyIndex % keys.length];
  if (!genAICache.has(activeKey)) {
    genAICache.set(activeKey, new GoogleGenerativeAI(activeKey));
  }
  return { ai: genAICache.get(activeKey), keyIndex: (currentKeyIndex % keys.length) + 1, totalKeys: keys.length };
}

function rotateToNextKey(reason = '') {
  const keys = (config.geminiApiKeys && config.geminiApiKeys.length > 0)
    ? config.geminiApiKeys
    : (config.geminiApiKey ? [config.geminiApiKey] : []);

  if (keys.length > 1) {
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    logger.warn('LLM', `Rotated to Gemini API key #${(currentKeyIndex % keys.length) + 1}/${keys.length} (Reason: ${reason})`);
  }
}

/**
 * Generate an agent response from a prompt using Gemini LLM.
 * Automatically fails over across working models and rotates API keys if quota/rate limits are hit.
 *
 * @param {string} prompt      â€” full prompt from promptBuilder
 * @param {string} agentName   â€” for logging only
 * @param {object} agentConfig â€” agent configuration
 * @param {number} round       â€” current round number
 * @param {number} maxRounds   â€” max rounds
 * @param {object} offerState  â€” latest offers
 * @returns {Promise<object>}  â€” { message, offer, decision, reasoning, parameters }
 */
async function generateAgentResponse(prompt, agentName, agentConfig, round, maxRounds, offerState) {
  const hasKey = config.geminiApiKey || (config.geminiApiKeys && config.geminiApiKeys.length > 0);
  if (!hasKey) {
    logger.warn('LLM', 'No GEMINI_API_KEY found, using realistic mock generator.');
    await sleep(1000);
    return generateMockResponse(agentName, agentConfig, round, maxRounds, offerState);
  }

  let lastError = null;

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const { ai, keyIndex, totalKeys } = getGenAIInstance();
      logger.llm(`Querying ${modelName} [Key ${keyIndex}/${totalKeys}] for ${agentName} (round ${round})...`);

      const model = ai.getGenerativeModel(
        {
          model: modelName,
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 2000,
          },
        },
        { timeout: 15000 }
      );

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      logger.llm(`${agentName} (${modelName}) raw response: ${text.slice(0, 150)}...`);

      // Parse JSON from model output
      let parsed = null;
      try {
        const cleaned = text
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/gi, '')
          .trim();
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        const jsonMatch = text.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error(`JSON parse failed: ${parseErr.message}`);
        }
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('LLM returned non-object JSON payload');
      }

      if (!parsed.message) {
        throw new Error('LLM response missing "message" string');
      }

      logger.llm(`âœ“ ${agentName} successfully generated via ${modelName}. Decision: ${parsed.decision}, Offer: ${parsed.offer}`);
      return parsed;

    } catch (err) {
      lastError = err;
      const statusPrefix = err.status ? `[HTTP ${err.status}] ` : '';
      const safeErrMsg = statusPrefix + (err.message ? err.message.slice(0, 120) : 'Unknown error');
      
      // If quota exhausted, rate limit, auth error, or server overloaded (503), rotate to the next key
      if (err.status === 429 || err.status === 403 || err.status === 503 || (err.message && (err.message.includes('429') || err.message.includes('503')))) {
        rotateToNextKey(`Status ${err.status || 'transient error'}`);
      }

      logger.warn('LLM', `Model ${modelName} failed for ${agentName}: ${safeErrMsg}. Trying next candidate...`);
      await sleep(300);
    }
  }

  // If all candidate models failed
  logger.error('LLM', `All Gemini model candidates failed for ${agentName}: ${lastError?.message?.slice(0, 150)}`);
  throw new Error(`LLM provider failure for ${agentName}: ${lastError?.message || 'Service unavailable'}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ----------------------------------------------------------------------
// VARIED MOCK GENERATOR — used when GEMINI_API_KEY is not configured.
// Personality-aware, round-aware, never repeats the same phrase.
// ----------------------------------------------------------------------
function generateMockResponse(agentName, agentConfig, round, maxRounds, offerState) {
  const role        = (agentConfig.role || '').toLowerCase();
  const personality = (agentConfig.personality || 'collaborative').toLowerCase();
  const isBuyer     = role.includes('buyer') || role.includes('candidate') || role.includes('project');

  const myOffer       = offerState[agentConfig.id] || null;
  const opponentId    = Object.keys(offerState).find(id => id !== agentConfig.id);
  const opponentOffer = opponentId ? offerState[opponentId] : null;

  const nc      = agentConfig.numericConstraint;
  const limit   = nc && nc.value ? nc.value : (isBuyer ? 800000 : 700000);
  const isFinal = round >= maxRounds;

  function computeOffer() {
    if (!opponentOffer) {
      const anchors = {
        aggressive: isBuyer ? 0.62 : 1.38, competitive: isBuyer ? 0.65 : 1.32,
        collaborative: isBuyer ? 0.72 : 1.25, flexible: isBuyer ? 0.75 : 1.20,
        'risk-averse': isBuyer ? 0.70 : 1.28, analytical: isBuyer ? 0.68 : 1.30,
        professional: isBuyer ? 0.73 : 1.24,
      };
      const factor = anchors[personality] || 0.72;
      return Math.round((limit * factor) / 500) * 500;
    }
    const base = myOffer || limit;
    const gap  = Math.abs(base - opponentOffer);
    const moveRates = {
      aggressive: 0.12, competitive: 0.15, collaborative: 0.22,
      flexible: 0.28, 'risk-averse': 0.10, analytical: 0.18, professional: 0.16,
    };
    const rate   = (moveRates[personality] || 0.20) * (1 + (round / maxRounds) * 0.5);
    const newVal = isBuyer ? base + gap * rate : base - gap * rate;
    if (isBuyer && nc && nc.type === 'max') return Math.min(Math.round(newVal / 500) * 500, nc.value);
    if (!isBuyer && nc && nc.type === 'min') return Math.max(Math.round(newVal / 500) * 500, nc.value);
    return Math.round(newVal / 500) * 500;
  }

  const fmt = v => v ? '\u20b9' + Number(v).toLocaleString('en-IN') : 'the proposed amount';

  if (opponentOffer !== null && opponentOffer !== undefined) {
    const diff = Math.abs((myOffer || limit) - opponentOffer);
    const avg  = ((myOffer || limit) + opponentOffer) / 2;
    if ((diff / avg < 0.04) || (isFinal && diff / avg < 0.08)) {
      const accepts = {
        aggressive: `After careful consideration, I will accept ${fmt(opponentOffer)}. Let's close this now.`,
        competitive: `${fmt(opponentOffer)} is acceptable. I agree — let's move forward.`,
        collaborative: `I appreciate the movement on your side. ${fmt(opponentOffer)} works for me. We have a deal!`,
        flexible: `That works. I accept ${fmt(opponentOffer)} — looking forward to working together.`,
        'risk-averse': `After reviewing all terms, I can accept ${fmt(opponentOffer)}. We have an agreement.`,
        analytical: `The numbers align. I accept ${fmt(opponentOffer)} as the final price.`,
        professional: `I am pleased to confirm acceptance of ${fmt(opponentOffer)}. Let us proceed formally.`,
      };
      return { message: accepts[personality] || `I accept ${fmt(opponentOffer)}.`, offer: opponentOffer, decision: 'accept', reasoning: 'Gap within tolerance.' };
    }
    if (isFinal) {
      const rejects = {
        aggressive: `We have reached the end of negotiations. ${fmt(opponentOffer)} is not something I can accept.`,
        collaborative: `I regret we could not find common ground. ${fmt(opponentOffer)} remains outside what I can agree to.`,
        'risk-averse': `Given my constraints, ${fmt(opponentOffer)} does not fit. I must decline.`,
        analytical: `The data does not support accepting ${fmt(opponentOffer)}. I have to pass.`,
        default: `I appreciate our discussion, but ${fmt(opponentOffer)} does not work for me. I will walk away.`,
      };
      return { message: rejects[personality] || rejects.default, offer: null, decision: 'reject', reasoning: 'Final round, unacceptable gap.' };
    }
  }

  const newOffer = computeOffer();
  const rd = round === 1 ? 'opening' : `round ${round}`;
  const counters = {
    aggressive: [
      `My ${rd} position is ${fmt(newOffer)}. I believe this is competitive given current market conditions.`,
      `I am prepared to offer ${fmt(newOffer)}, and I expect this to be taken seriously.`,
      `${fmt(newOffer)} is where I stand. I have reviewed your position and this is my best move.`,
    ],
    competitive: [
      `After analyzing your offer, I can move to ${fmt(newOffer)}. I am still protecting critical value here.`,
      `I will counter at ${fmt(newOffer)}. Let us see if we can close this efficiently.`,
      `My revised position is ${fmt(newOffer)}. I have moved — I expect reciprocal movement from you.`,
    ],
    collaborative: [
      `I want to find a deal that works for both of us. How about ${fmt(newOffer)}? I am genuinely trying to meet you halfway.`,
      `I appreciate your offer. Let me propose ${fmt(newOffer)} — I think this gives both of us a fair outcome.`,
      `In the spirit of reaching agreement, I am offering ${fmt(newOffer)}. I hope we can build on this momentum.`,
    ],
    flexible: [
      `I am adjusting my position to ${fmt(newOffer)}. I want to keep this negotiation moving productively.`,
      `Here is a revised number: ${fmt(newOffer)}. I am flexible and open to your thoughts.`,
      `Let us try ${fmt(newOffer)}. I am willing to keep working if you are.`,
    ],
    'risk-averse': [
      `After careful review, I can offer ${fmt(newOffer)}. This is a measured move within my parameters.`,
      `I have evaluated the risks carefully. ${fmt(newOffer)} is where I can responsibly move to right now.`,
      `A small but deliberate step: ${fmt(newOffer)}. I need to be sure of each move I make here.`,
    ],
    analytical: [
      `Based on market benchmarks and gap analysis, ${fmt(newOffer)} is the logical next step.`,
      `The numbers indicate ${fmt(newOffer)} as a reasonable compromise. Let us evaluate this together.`,
      `I have run the figures — ${fmt(newOffer)} represents a fair concession relative to overall value.`,
    ],
    professional: [
      `In accordance with my guidelines, I am formally proposing ${fmt(newOffer)} for your consideration.`,
      `Per standard procedures, my revised offer stands at ${fmt(newOffer)}.`,
      `I have reviewed the terms and submit ${fmt(newOffer)} as my structured counter-proposal.`,
    ],
  };
  const pool    = counters[personality] || counters.collaborative;
  const message = pool[Math.min(round - 1, pool.length - 1)] || pool[pool.length - 1];
  logger.llm(`[MOCK] ${agentName} -> counter_offer at ${newOffer} (round ${round}, ${personality})`);
  return { message, offer: newOffer, decision: 'counter_offer', reasoning: `Round ${round}: moving based on ${personality} strategy.` };
}

module.exports = { generateAgentResponse };