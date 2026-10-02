/**
 * services/coaching.service.js
 * AI Coach — generates structured feedback from a completed Practice Mode transcript.
 * Uses the existing LLM helper (generateAgentResponse pattern) with a dedicated prompt.
 */

'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config/env');
const logger = require('../utils/logger');

const MODEL_CANDIDATES = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
];

const MAX_RETRIES = 2;

function getGenAI() {
  const keys = (config.geminiApiKeys && config.geminiApiKeys.length > 0)
    ? config.geminiApiKeys
    : (config.geminiApiKey ? [config.geminiApiKey] : []);
  if (keys.length === 0) throw new Error('No GEMINI_API_KEY configured.');
  return new GoogleGenerativeAI(keys[0]);
}

async function _callLLM(prompt) {
  const ai = getGenAI();
  for (const modelName of MODEL_CANDIDATES) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const model = ai.getGenerativeModel({
          model: modelName,
          generationConfig: { temperature: 0.5, topP: 0.9, maxOutputTokens: 2000 },
        }, { timeout: 25000 });

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        // Parse JSON
        const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        return JSON.parse(cleaned);
      } catch (err) {
        const isLast = attempt === MAX_RETRIES;
        if (!isLast) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
        logger.warn('CoachService', `Model ${modelName} failed: ${err.message}`);
      }
    }
  }
  throw new Error('All LLM candidates failed for coaching.');
}

/**
 * Build coaching feedback fallback (static, safe).
 */
function _fallbackFeedback(messages) {
  const humanMessages = (messages || []).filter(m => m.role === 'human' || m.agentId === 'human');
  const count = humanMessages.length;
  return {
    overallScore: 50,
    strengths: ['You participated in the negotiation and made offers.'],
    mistakes: count === 0 ? [{ turn: 0, description: 'No messages were submitted by the human participant.' }] : [],
    missedOpportunities: ['Consider using anchoring strategies to set a favorable opening offer.'],
    actionableTips: [
      'Start with a confident but reasonable opening offer to anchor the negotiation.',
      'Listen to the AI agent\'s reasoning before making large concessions.',
      'Track how much you have conceded vs. the AI to avoid an unfavorable deal.',
    ],
    generationStatus: 'fallback',
  };
}

/**
 * Generate AI coaching feedback from a negotiation session's messages.
 *
 * @param {object} session — saved Session document (from MongoDB) or live session
 * @returns {object} coaching data
 */
async function generateCoaching(session) {
  const messages = session.messages || [];
  const scenarioName = session.scenarioName || session.scenario?.name || 'Negotiation';
  const outcome = session.outcome || session.result || 'unknown';
  const totalRounds = session.totalRounds || session.currentRound || 0;
  const participants = session.participants || session.agents || [];

  if (!config.geminiApiKey && !(config.geminiApiKeys && config.geminiApiKeys.length > 0)) {
    logger.warn('CoachService', 'No API key — returning fallback coaching.');
    return { ..._fallbackFeedback(messages), generationStatus: 'fallback' };
  }

  // Summarise transcript for prompt (avoid token bloat)
  const transcriptLines = messages.slice(0, 60).map((m, i) =>
    `[Turn ${i + 1}] ${m.agentName || m.agentId} (${m.decision || 'message'}): "${(m.message || '').slice(0, 120)}"`
  ).join('\n');

  const humanParticipant = participants.find(p =>
    p.agentType === 'human' || p.id === 'human'
  );
  const humanName = humanParticipant?.name || 'Human';

  const prompt = `
You are an expert negotiation coach analyzing a ${scenarioName} negotiation.
The human participant was "${humanName}". The session ended with outcome: "${outcome}" after ${totalRounds} rounds.

TRANSCRIPT (abbreviated):
${transcriptLines || '(No messages recorded)'}

Provide structured coaching feedback as STRICT JSON (no markdown, no extra text):
{
  "overallScore": <integer 0-100>,
  "strengths": [<string>, ...],
  "mistakes": [{ "turn": <integer>, "description": <string> }, ...],
  "missedOpportunities": [<string>, ...],
  "actionableTips": [<string>, <string>, <string>]
}

Rules:
- overallScore reflects the human's negotiation quality, not just outcome.
- strengths: 1-3 genuine strengths observed.
- mistakes: up to 5 specific mistakes with turn numbers (use turn 0 if general).
- missedOpportunities: 1-3 strategic opportunities the human missed.
- actionableTips: exactly 3 short, specific, actionable coaching tips.
- All values must be present. Return ONLY the JSON object.
`.trim();

  try {
    const parsed = await _callLLM(prompt);

    // Validate / sanitize
    const report = {
      overallScore: typeof parsed.overallScore === 'number'
        ? Math.max(0, Math.min(100, Math.round(parsed.overallScore))) : 50,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5) : [],
      mistakes: Array.isArray(parsed.mistakes) ? parsed.mistakes.slice(0, 10).map(m => ({
        turn: Number(m.turn) || 0,
        description: String(m.description || ''),
      })) : [],
      missedOpportunities: Array.isArray(parsed.missedOpportunities) ? parsed.missedOpportunities.slice(0, 5) : [],
      actionableTips: Array.isArray(parsed.actionableTips) ? parsed.actionableTips.slice(0, 3) : [],
      generationStatus: 'success',
    };
    logger.info('CoachService', `Coaching generated. Score: ${report.overallScore}`);
    return report;
  } catch (err) {
    logger.error('CoachService', `Coaching generation failed: ${err.message}. Using fallback.`);
    return { ..._fallbackFeedback(messages), generationStatus: 'fallback' };
  }
}

/**
 * Generate a single hint for the human's next move during Practice Mode.
 *
 * @param {object} session — live in-memory session
 * @returns {string} short hint text
 */
async function generateHint(session) {
  const messages = session.messages || [];
  const lastFew = messages.slice(-6).map(m =>
    `${m.agentName || m.agentId}: "${(m.message || '').slice(0, 100)}"`
  ).join('\n');

  const humanOffer = Object.entries(session.offers || {})
    .find(([id]) => id === 'human' || (session.agents || []).find(a => a.id === id && (a.type === 'human' || a.agentType === 'human')))?.[1];

  const aiOffer = Object.entries(session.offers || {})
    .find(([id]) => id !== 'human' && !(session.agents || []).find(a => a.id === id && (a.type === 'human' || a.agentType === 'human')))?.[1];

  if (!config.geminiApiKey && !(config.geminiApiKeys && config.geminiApiKeys.length > 0)) {
    return 'Consider making a small concession to show good faith and keep momentum.';
  }

  const prompt = `
You are a negotiation coach giving ONE short hint to a human negotiating in "${session.scenario?.name || 'a negotiation'}".
Current round: ${session.currentRound}/${session.maxRounds}.
Human's latest offer: ${humanOffer != null ? humanOffer : 'not yet made'}.
AI opponent's latest offer: ${aiOffer != null ? aiOffer : 'not yet made'}.
Recent exchanges:
${lastFew || '(none yet)'}

Give ONE concise, actionable negotiation hint (max 2 sentences). Return plain text only, no JSON.
`.trim();

  try {
    const ai = getGenAI();
    const model = ai.getGenerativeModel({
      model: MODEL_CANDIDATES[0],
      generationConfig: { temperature: 0.6, maxOutputTokens: 150 },
    }, { timeout: 10000 });
    const result = await model.generateContent(prompt);
    return result.response.text().trim().slice(0, 300);
  } catch (err) {
    logger.warn('CoachService', `Hint generation failed: ${err.message}`);
    return 'Consider your current position and the gap remaining — a small concession may move things forward.';
  }
}

module.exports = { generateCoaching, generateHint };
