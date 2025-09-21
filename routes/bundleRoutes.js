const express = require('express');
const router = express.Router();
const { ingestBundle } = require('../controllers/bundleController');
const authMiddleware = require('../utils/authMiddleware');

// Endpoint to receive FHIR Bundles, protected by our mock auth middleware
router.post('/Bundle', authMiddleware, ingestBundle);

module.exports = router;
