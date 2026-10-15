const express = require('express');
const router = express.Router();
const { ingestBundle } = require('../controllers/bundleController');
const { getCodeSystem, getConceptMap, translateCode } = require('../controllers/terminologyController');
const authMiddleware = require('../utils/authMiddleware');

// Endpoint to receive FHIR Bundles, protected by mock auth middleware
router.post('/Bundle', authMiddleware, ingestBundle);

// FHIR Resource endpoints under /api/fhir
router.get('/CodeSystem', getCodeSystem);
router.get('/ConceptMap', getConceptMap);
router.get('/ConceptMap/\\$translate', translateCode);

module.exports = router;
