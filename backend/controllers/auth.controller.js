/**
 * controllers/auth.controller.js
 * Handles user registration, login, and Google OAuth.
 */

'use strict';

const User = require('../models/user.model');
const { generateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * POST /api/auth/register
 * Body: { name, email, password }
 */
async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: { message: 'Name, email, and password are required.', code: 'VALIDATION_ERROR' }
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: { message: 'Password must be at least 6 characters.', code: 'VALIDATION_ERROR' }
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        error: { message: 'An account with this email already exists.', code: 'EMAIL_EXISTS' }
      });
    }

    const user = await User.create({ name, email: email.toLowerCase(), password });
    const token = generateToken(user);

    logger.info('Auth', `New user registered: ${user.email}`);

    res.status(201).json({
      message: 'Account created successfully.',
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: { message: 'An account with this email already exists.', code: 'EMAIL_EXISTS' }
      });
    }
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: { message: 'Email and password are required.', code: 'VALIDATION_ERROR' }
      });
    }

    // Find user with password field included
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({
        error: { message: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' }
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        error: { message: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' }
      });
    }

    const token = generateToken(user);

    logger.info('Auth', `User logged in: ${user.email}`);

    res.json({
      message: 'Login successful.',
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/google
 * Body: { credential } — Google ID token from frontend
 */
async function googleAuth(req, res, next) {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        error: { message: 'Google credential is required.', code: 'VALIDATION_ERROR' }
      });
    }

    // Decode the Google JWT (the frontend sends the ID token)
    // For production, verify with Google's public keys. For now, decode the payload.
    const parts = credential.split('.');
    if (parts.length !== 3) {
      return res.status(400).json({
        error: { message: 'Invalid Google credential format.', code: 'VALIDATION_ERROR' }
      });
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const { sub: googleId, email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({
        error: { message: 'Google account email not available.', code: 'VALIDATION_ERROR' }
      });
    }

    // Find existing user by email or googleId
    let user = await User.findOne({ $or: [{ googleId }, { email: email.toLowerCase() }] });

    if (user) {
      // Link Google ID if not already linked
      if (!user.googleId) {
        user.googleId = googleId;
        user.avatar = picture || user.avatar;
        await user.save();
      }
    } else {
      // Create new user from Google profile
      user = await User.create({
        name: name || email.split('@')[0],
        email: email.toLowerCase(),
        googleId,
        avatar: picture || null,
        password: require('crypto').randomBytes(32).toString('hex'), // random password for Google users
      });
    }

    const token = generateToken(user);

    logger.info('Auth', `Google login: ${user.email}`);

    res.json({
      message: 'Google login successful.',
      user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
      token,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Returns the current authenticated user profile.
 */
async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        error: { message: 'User not found.', code: 'NOT_FOUND' }
      });
    }

    res.json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, googleAuth, getMe };
