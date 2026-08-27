/**
 * utils/logger.js
 * Simple structured logger with context prefixes.
 * Never logs API keys or sensitive data.
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

function log(level, context, ...args) {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return;
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${context}]`;
  if (level === 'error') {
    console.error(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

const logger = {
  debug: (ctx, ...args) => log('debug', ctx, ...args),
  info:  (ctx, ...args) => log('info',  ctx, ...args),
  warn:  (ctx, ...args) => log('warn',  ctx, ...args),
  error: (ctx, ...args) => log('error', ctx, ...args),

  // Domain-specific helpers
  negotiation: (msg, ...args) => log('info', 'Negotiation', msg, ...args),
  agent:       (msg, ...args) => log('info', 'Agent', msg, ...args),
  llm:         (msg, ...args) => log('info', 'LLM', msg, ...args),
  round:       (msg, ...args) => log('info', 'Round', msg, ...args),
};

module.exports = logger;
