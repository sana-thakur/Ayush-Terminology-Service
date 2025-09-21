const express = require('express');
const router = express.Router();
const { searchTerm, getCodeSystem, getConceptMap, translateCode } = require('../controllers/terminologyController');

// Autocomplete search endpoint
router.get('/search', searchTerm);

// FHIR Resource endpoints
router.get('/CodeSystem', getCodeSystem);
router.get('/ConceptMap', getConceptMap);

// FHIR $translate operation
router.get('/ConceptMap/\\$translate', translateCode);

module.exports = router;
