const express = require('express');
const router = express.Router();
const adminAuth = require('../utils/adminAuthMiddleware');
const {
  getAdminStats,
  getAllMappings,
  getMappingRecord,
  verifyMapping,
  flagMapping,
  getMappingHistory,
  getClaimsReviewRequests,
  updateClaimsReviewRequest
} = require('../controllers/adminController');

// All administrative endpoints require admin authentication
router.use(adminAuth);

// Summary statistics for admin dashboard
router.get('/stats', getAdminStats);

// List all mappings with status
router.get('/mappings', getAllMappings);

// Record mapping details & verification status
router.get('/mappings/:system/:id', getMappingRecord);

// Verify an ICD-11 mapping for a record
router.post('/mappings/:system/:id/verify', verifyMapping);

// Flag an incorrect or missing ICD-11 mapping
router.post('/mappings/:system/:id/flag', flagMapping);

// Chronological audit history for a record
router.get('/mappings/:system/:id/history', getMappingHistory);

// List and inspect pending insurance claims manual review requests
router.get('/claims-review-requests', getClaimsReviewRequests);

// Update review status and append adjudication notes
router.patch('/claims-review-requests/:id', updateClaimsReviewRequest);

module.exports = router;
