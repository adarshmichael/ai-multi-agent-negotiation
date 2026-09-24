/**
 * middleware/auth.js
 * JWT authentication middleware for NegoSim.
 */

'use strict';

const jwt    = require('jsonwebtoken');
const { config } = require('../config/env');

/**
 * Protect routes — requires a valid JWT in the Authorization header.
 * Sets req.user = { id, email, name, role }
 */
function protect(req, res, next) {
  let token = null;

  // Check Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  // Fallback: check cookie
  if (!token && req.cookies) {
    token = req.cookies.negosim_token;
  }

  if (!token) {
    return res.status(401).json({
      error: { message: 'Not authenticated. Please log in.', code: 'UNAUTHORIZED' }
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      error: { message: 'Invalid or expired token. Please log in again.', code: 'TOKEN_EXPIRED' }
    });
  }
}

/**
 * Generate a JWT for a user.
 */
function generateToken(user) {
  return jwt.sign(
    { id: user._id || user.id, email: user.email, name: user.name, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry || '7d' }
  );
}

module.exports = { protect, generateToken };
