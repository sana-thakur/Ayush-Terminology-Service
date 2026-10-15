const express = require('express');
const router = express.Router();
const researchAuth = require('../utils/researchAuthMiddleware');
const {
  getResearchRecords,
  getByTm2Code,
  exportDataset
} = require('../controllers/researchController');

// All research portal endpoints require researcher authentication
router.use(researchAuth);

// Paginated cohort discovery with multi-parameter filtering
router.get('/records', getResearchRecords);

// Exact ICD-11 TM2 crosswalk lookup across all traditions
router.get('/by-tm2-code', getByTm2Code);

// Full dataset export (CSV or JSON) matching active filters
router.get('/export', exportDataset);

module.exports = router;
