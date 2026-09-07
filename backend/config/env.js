/**
 * config/env.js
 * Load and validate environment variables.
 * GEMINI_API_KEY is optional — Mock mode works without it.
 */

require('dotenv').config();

const config = {
  port:         parseInt(process.env.PORT || '8001', 10),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  maxRounds:    parseInt(process.env.MAX_ROUNDS || '10', 10),
  thinkDelayMs: parseInt(process.env.THINK_DELAY_MS || '1500', 10),
  nodeEnv:      process.env.NODE_ENV || 'development',
};

function validateConfig() {
  if (!config.geminiApiKey) {
    console.warn('[Config] WARNING: GEMINI_API_KEY is not set — Gemini mode will fall back to Mock responses.');
    console.warn('[Config] To enable Gemini, add GEMINI_API_KEY to backend/.env');
  } else {
    console.log('[Config] Gemini API key: configured ✓');
  }
  console.log(`[Config] Port: ${config.port} | Max Rounds: ${config.maxRounds} | Think Delay: ${config.thinkDelayMs}ms`);
}

module.exports = { config, validateConfig };
