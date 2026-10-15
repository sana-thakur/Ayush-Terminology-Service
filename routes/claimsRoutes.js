const express = require('express');
const router = express.Router();
const {
  resolveClaimCode,
  searchClaimsTerms,
  createClaimReviewRequest
} = require('../controllers/claimsController');

// Code lookup and resolution for insurance claim adjudication
router.get('/resolve', resolveClaimCode);

// Ambiguity search by diagnosis name
router.get('/search', searchClaimsTerms);

// Create manual medical review request
router.post('/review-requests', createClaimReviewRequest);

module.exports = router;
