/**
 * config/env.js
 * Load and validate environment variables. Fail fast if required vars are missing.
 */

require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '8001', 10),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  maxRounds: parseInt(process.env.MAX_ROUNDS || '10', 10),
  thinkDelayMs: parseInt(process.env.THINK_DELAY_MS || '2000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
};

function validateConfig() {
  if (!config.geminiApiKey) {
    console.error('[Config] FATAL: GEMINI_API_KEY is not set in .env');
    console.error('[Config] Create backend/.env based on .env.example and add your key.');
    process.exit(1);
  }
  console.log('[Config] Environment loaded successfully.');
  console.log(`[Config] Port: ${config.port} | Max Rounds: ${config.maxRounds} | Think Delay: ${config.thinkDelayMs}ms`);
}

module.exports = { config, validateConfig };
