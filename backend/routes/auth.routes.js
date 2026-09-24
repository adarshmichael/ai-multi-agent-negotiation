/**
 * routes/auth.routes.js
 * Authentication REST routes.
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');

router.post('/register', controller.register);
router.post('/login',    controller.login);
router.post('/google',   controller.googleAuth);
router.get('/me',        protect, controller.getMe);

module.exports = router;
