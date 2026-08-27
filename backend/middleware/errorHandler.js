/**
 * middleware/errorHandler.js
 * Global Express error handler.
 * Never exposes stack traces or internal details to clients.
 */

const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  // Log full error server-side
  logger.error('HTTP', `${req.method} ${req.path} — ${err.message}`);
  if (process.env.NODE_ENV === 'development') {
    logger.error('HTTP', err.stack);
  }

  // Determine safe status code
  const statusCode = err.statusCode || err.status || 500;

  // Return safe error to client (no stack traces)
  res.status(statusCode).json({
    error: {
      message: statusCode === 500 ? 'An internal server error occurred.' : err.message,
      code: err.code || 'SERVER_ERROR',
    },
  });
}

module.exports = errorHandler;
