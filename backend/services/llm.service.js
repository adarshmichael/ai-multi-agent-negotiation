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

// Try multiple models in order of preference
const MODEL_CANDIDATES = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-latest',
  'gemini-pro',
];

let genAI = null;
let model = null;
let workingModel = null;

async function initModel() {
  if (model && workingModel) return model;

  genAI = new GoogleGenerativeAI(config.geminiApiKey);

  // Try each model candidate until one works
  for (const modelName of MODEL_CANDIDATES) {
    try {
      const candidate = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.8,
          topP: 0.9,
          maxOutputTokens: 600,
        },
      });

      // Quick test call to verify model works
      const testResult = await candidate.generateContent('Reply with only: ok');
      const testText = testResult.response.text();
      if (testText) {
        model = candidate;
        workingModel = modelName;
        logger.llm(`✓ Working model found: ${modelName}`);
        return model;
      }
    } catch (err) {
      logger.warn('LLM', `Model ${modelName} test failed: ${err.message.slice(0, 80)}`);
    }
  }

  logger.error('LLM', 'No working Gemini model found. Falling back to Mock responses.');
  return null; // Signals to use mock
}

/**
 * Generate an agent response from a prompt.
 * Retries once on JSON parse failure.
 *
 * @param {string} prompt    — full prompt from promptBuilder
 * @param {string} agentName — for logging only
 * @returns {object}         — { message, offer, decision } (reasoning stripped by caller)
 */
async function generateAgentResponse(prompt, agentName, agentConfig, round, maxRounds, offerState) {
  const llmModel = await initModel();

  if (!llmModel) {
    // FALLBACK: Realistic Mock Responses for testing UI without API key
    await sleep(1500); // Simulate network latency
    return generateMockResponse(agentName, agentConfig, round, maxRounds, offerState);
  }

  logger.llm(`Generating response for ${agentName} (model: ${workingModel})...`);
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await llmModel.generateContent(prompt);
      const text = result.response.text().trim();

      logger.llm(`${agentName} raw response (attempt ${attempt}): ${text.slice(0, 200)}`);

      // Parse JSON — handle markdown code blocks and plain JSON
      let parsed;
      try {
        // Remove markdown code blocks if present
        const cleaned = text
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/gi, '')
          .trim();
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        // Try to extract JSON from text
        const jsonMatch = text.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error(`JSON parse failed: ${parseErr.message}. Raw: ${text.slice(0, 100)}`);
        }
      }

      // Ensure required fields exist
      if (!parsed.message) {
        throw new Error('Response missing required "message" field');
      }

      logger.llm(`${agentName} response parsed. Decision: ${parsed.decision}, Offer: ${parsed.offer}`);
      return parsed;

    } catch (err) {
      lastError = err;
      logger.warn('LLM', `${agentName} attempt ${attempt} failed: ${err.message.slice(0, 120)}`);
      if (attempt < 2) {
        await sleep(1500);
      }
    }
  }

  // Both attempts failed
  logger.error('LLM', `${agentName} all attempts failed. Last error: ${lastError?.message}`);
  throw new Error(`LLM generation failed for ${agentName}: ${lastError?.message}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ----------------------------------------------------------------------
// MOCK GENERATOR FOR UI TESTING WHEN API KEY FAILS
// ----------------------------------------------------------------------
function generateMockResponse(agentName, agentConfig, round, maxRounds, offerState) {
  const role = agentConfig.role.toLowerCase();
  const isBuyer = role.includes('buyer') || role.includes('candidate') || role.includes('project manager');
  
  // Find current offers
  const myOffer = offerState[agentConfig.id] || null;
  const opponentId = Object.keys(offerState).find(id => id !== agentConfig.id);
  const opponentOffer = opponentId ? offerState[opponentId] : null;

  let newOffer = myOffer;
  let decision = 'counter_offer';
  let message = '';

  const isFinalRound = round >= maxRounds;

  if (round === 1) {
    // Initial offer
    const base = isBuyer ? 700000 : 900000; 
    newOffer = base + (Math.random() * 50000 * (isBuyer ? -1 : 1));
    newOffer = Math.round(newOffer / 1000) * 1000; // Round to nearest 1k
    message = `Hello! Thanks for meeting with me. After reviewing the requirements, I can offer ${newOffer}. Let me know if this works for you.`;
  } else if (opponentOffer) {
    // Evaluate opponent's offer
    const gap = Math.abs((myOffer || 0) - opponentOffer);
    
    if (gap < 20000 || isFinalRound && gap < 50000) {
      decision = 'accept';
      newOffer = opponentOffer;
      message = `You know what, ${opponentOffer} works for me. We have a deal. Looking forward to working together!`;
    } else if (isFinalRound) {
      decision = 'reject';
      message = `I appreciate the discussion, but ${opponentOffer} is just too far from what I can accept. I'm going to have to walk away this time.`;
    } else {
      // Counter offer (move 15-30% towards opponent)
      const movement = gap * (0.15 + Math.random() * 0.15);
      newOffer = (myOffer || (isBuyer ? 700000 : 900000)) + (movement * (isBuyer ? 1 : -1));
      newOffer = Math.round(newOffer / 1000) * 1000;
      message = `I understand your position, but ${opponentOffer} doesn't quite work for my constraints. How about we meet at ${newOffer}?`;
    }
  }

  logger.llm(`[MOCK] ${agentName} -> ${decision} at ${newOffer}`);
  return { message, offer: newOffer, decision };
}

module.exports = { generateAgentResponse };
