/**
 * config/env.js
 * Load and validate environment variables.
 * GEMINI_API_KEY is optional — Mock mode works without it.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
const geminiApiKeys = rawKeys
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

const config = {
  port:          parseInt(process.env.PORT || '8001', 10),
  geminiApiKey:  geminiApiKeys[0] || '',
  geminiApiKeys: geminiApiKeys,
  maxRounds:     parseInt(process.env.MAX_ROUNDS || '10', 10),
  thinkDelayMs:  parseInt(process.env.THINK_DELAY_MS || '1500', 10),
  nodeEnv:       process.env.NODE_ENV || 'development',
};

function validateConfig() {
  if (!config.geminiApiKey) {
    console.warn('[Config] WARNING: GEMINI_API_KEY is not set — Gemini mode will fall back to Mock responses.');
    console.warn('[Config] To enable Gemini, add GEMINI_API_KEY to backend/.env');
  } else {
    console.log(`[Config] Gemini API: ${config.geminiApiKeys.length} key(s) configured ✓`);
  }
  console.log(`[Config] Port: ${config.port} | Max Rounds: ${config.maxRounds} | Think Delay: ${config.thinkDelayMs}ms`);
}

module.exports = { config, validateConfig };
