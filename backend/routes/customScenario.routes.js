/**
 * routes/customScenario.routes.js
 * Custom scenario CRUD routes.
 */

'use strict';

const express = require('express');
const router  = express.Router();
const controller = require('../controllers/customScenario.controller');

router.get('/custom-scenarios',                       controller.listCustomScenarios);
router.post('/custom-scenarios',                      controller.createCustomScenario);
router.get('/custom-scenarios/:id',                   controller.getCustomScenario);
router.put('/custom-scenarios/:id',                   controller.updateCustomScenario);
router.delete('/custom-scenarios/:id',                controller.deleteCustomScenario);
router.post('/custom-scenarios/:id/duplicate',        controller.duplicateCustomScenario);

module.exports = router;
