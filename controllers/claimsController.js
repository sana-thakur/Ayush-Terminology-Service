const { getAllRecords, findRecord } = require('./terminologyController');
const reviewStore = require('../models/reviewStore');
const claimsStore = require('../models/claimsStore');

const VALID_SYSTEMS = ['ayurveda', 'siddha', 'unani'];

/**
 * GET /api/claims/resolve?system=...&code=...
 * Exact code lookup within a tradition with explicit resolution outcome determination
 */
async function resolveClaimCode(req, res) {
  try {
    const rawSystem = (req.query.system || '').trim();
    const rawCode = (req.query.code || '').trim();

    // 1. Validation for malformed / missing input
    if (!rawSystem || !rawCode) {
      return res.status(400).json({
        outcome: 'invalid_code',
        resolved: false,
        error: 'MissingParameters',
        message: "Both 'system' and 'code' query parameters are required for claim resolution."
      });
    }

    if (!VALID_SYSTEMS.includes(rawSystem.toLowerCase())) {
      return res.status(400).json({
        outcome: 'invalid_code',
        resolved: false,
        error: 'InvalidSystem',
        message: `Invalid tradition '${rawSystem}'. Allowed systems: Ayurveda, Siddha, Unani.`
      });
    }

    const allRecords = getAllRecords();
    const record = allRecords.find(item =>
      item.system.toLowerCase() === rawSystem.toLowerCase() &&
      item.code.toLowerCase() === rawCode.toLowerCase()
    );

    // 2. Unrecognized code
    if (!record) {
      return res.status(404).json({
        outcome: 'unrecognized_code',
        resolved: false,
        system: rawSystem,
        code: rawCode,
        error: 'UnrecognizedCode',
        message: `Code '${rawCode}' was not found within tradition '${rawSystem}'.`
      });
    }

    // 3. Mapping and Admin Verification evaluation
    const hasTm2 = Boolean(
      record.icd11_tm2_code &&
      record.icd11_tm2_code !== 'N/A' &&
      record.icd11_tm2_display &&
      record.icd11_tm2_display !== 'Not Mapped'
    );

    const hasBiomed = Boolean(
      record.icd11_biomed_code &&
      record.icd11_biomed_code !== 'N/A' &&
      record.icd11_biomed_display &&
      record.icd11_biomed_display !== 'Not Mapped'
    );

    const statusInfo = reviewStore.computeRecordStatus(record);

    // Explicit outcome categorization:
    // - 'flagged': admin review state is flagged
    // - 'unmapped': recognized term, but TM2 is missing/N/A (requires manual medical review)
    // - 'partially_mapped': one mapping missing (e.g. TM2 present, biomed missing)
    // - 'unverified': both present, but admin review state is pending or unverified
    // - 'mapped': both TM2 and biomed present and admin verified
    let outcome = 'unmapped';

    if (statusInfo.status === 'flagged') {
      outcome = 'flagged';
    } else if (!hasTm2) {
      outcome = 'unmapped';
    } else if (hasTm2 && !hasBiomed) {
      outcome = 'partially_mapped';
    } else if (hasTm2 && hasBiomed) {
      if (statusInfo.status === 'verified') {
        outcome = 'mapped';
      } else {
        outcome = 'unverified';
      }
    }

    const requiresManualReview = (outcome !== 'mapped');
    const guidanceText = 'Missing WHO ICD-11 TM2 or Biomedical crosswalks do not justify automated claim denial under AYUSH health insurance standards. Route to manual medical review.';

    res.status(200).json({
      outcome,
      resolved: true,
      system: record.system,
      code: record.code,
      claimResolution: {
        outcome,
        requiresManualReview,
        resolvedAt: new Date().toISOString()
      },
      record: {
        id: record.id,
        code: record.code,
        nationalAyushCode: record.code,
        term: record.term,
        system: record.system,
        definition: record.definition,
        icd11Tm2Code: record.icd11_tm2_code || 'N/A',
        icd11Tm2Display: record.icd11_tm2_display || 'Not Mapped',
        icd11BiomedCode: record.icd11_biomed_code || 'N/A',
        icd11BiomedDisplay: record.icd11_biomed_display || 'Not Mapped',
        compositeKey: reviewStore.getRecordKey(record.system, record.id)
      },
      crosswalks: {
        tm2: {
          code: record.icd11_tm2_code || 'N/A',
          display: record.icd11_tm2_display || 'Not Mapped',
          isMapped: hasTm2
        },
        biomed: {
          code: record.icd11_biomed_code || 'N/A',
          display: record.icd11_biomed_display || 'Not Mapped',
          isMapped: hasBiomed
        }
      },
      adminReview: {
        status: statusInfo.status,
        reviewStatus: statusInfo.status,
        isStale: statusInfo.isStale,
        staleReason: statusInfo.staleReason,
        lastReviewedAt: statusInfo.review ? statusInfo.review.lastReviewedAt : null,
        lastReviewedBy: statusInfo.review ? statusInfo.review.lastReviewedBy : null,
        flagDetails: statusInfo.review ? statusInfo.review.flagDetails : null
      },
      mappingCompleteness: statusInfo.completeness,
      requiresManualReview,
      regulatoryGuidance: guidanceText,
      statutoryGuidance: guidanceText
    });
  } catch (error) {
    console.error('[ClaimsController] Error in resolveClaimCode:', error);
    res.status(500).json({ outcome: 'error', error: 'Internal server error resolving claim code.' });
  }
}

/**
 * GET /api/claims/search?q=...&system=...&page=1&limit=10
 * Ambiguity resolution search by diagnosis name/term within a tradition
 */
async function searchClaimsTerms(req, res) {
  try {
    const query = (req.query.q || '').trim().toLowerCase();
    const systemFilter = (req.query.system || '').trim().toLowerCase();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit || '10', 10)));

    let filtered = getAllRecords();

    if (systemFilter && systemFilter !== 'all') {
      filtered = filtered.filter(item => item.system && item.system.toLowerCase() === systemFilter);
    }

    if (query) {
      filtered = filtered.filter(item =>
        (item.term && item.term.toLowerCase().includes(query)) ||
        (item.code && item.code.toLowerCase().includes(query)) ||
        (item.definition && item.definition.toLowerCase().includes(query)) ||
        (item.icd11_biomed_display && item.icd11_biomed_display.toLowerCase().includes(query))
      );
    }

    const totalResults = filtered.length;
    const totalPages = Math.ceil(totalResults / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginated = filtered.slice(startIndex, startIndex + limit);

    const results = paginated.map(item => {
      const statusInfo = reviewStore.computeRecordStatus(item);
      const hasTm2 = Boolean(item.icd11_tm2_code && item.icd11_tm2_code !== 'N/A');
      const hasBiomed = Boolean(item.icd11_biomed_code && item.icd11_biomed_code !== 'N/A');

      let outcome = 'unmapped';
      if (statusInfo.status === 'flagged') outcome = 'flagged';
      else if (!hasTm2) outcome = 'unmapped';
      else if (hasTm2 && !hasBiomed) outcome = 'partially_mapped';
      else if (hasTm2 && hasBiomed) outcome = (statusInfo.status === 'verified') ? 'mapped' : 'unverified';

      return {
        id: item.id,
        system: item.system,
        code: item.code,
        term: item.term,
        definition: item.definition,
        compositeKey: reviewStore.getRecordKey(item.system, item.id),
        outcome,
        hasTm2,
        hasBiomed,
        tm2Code: item.icd11_tm2_code,
        tm2Display: item.icd11_tm2_display,
        biomedCode: item.icd11_biomed_code,
        biomedDisplay: item.icd11_biomed_display,
        reviewStatus: statusInfo.status,
        resolutionPreview: {
          outcome,
          hasTm2,
          hasBiomed,
          requiresManualReview: (outcome !== 'mapped')
        }
      };
    });

    res.json({
      pagination: {
        currentPage: page,
        totalPages,
        totalResults,
        limit
      },
      results
    });
  } catch (error) {
    console.error('[ClaimsController] Error in searchClaimsTerms:', error);
    res.status(500).json({ error: 'Failed to search claims terminology.' });
  }
}

/**
 * POST /api/claims/review-requests
 * Authorized creation of a manual medical review request
 */
async function createClaimReviewRequest(req, res) {
  try {
    const {
      claimReference,
      system,
      recordId,
      code,
      term,
      reason,
      notes,
      requestedBy
    } = req.body || {};

    if (!claimReference || !system || !recordId || !code || !reason) {
      return res.status(400).json({
        error: 'MissingRequiredFields',
        message: 'claimReference, system, recordId, code, and reason are required.'
      });
    }

    // Verify record exists
    const record = findRecord(system, recordId);
    if (!record) {
      return res.status(404).json({
        error: 'RecordNotFound',
        message: `Concept record not found for system '${system}' and ID '${recordId}'.`
      });
    }

    const snapshot = {
      term: record.term,
      code: record.code,
      system: record.system,
      definition: record.definition,
      icd11_tm2_code: record.icd11_tm2_code,
      icd11_tm2_display: record.icd11_tm2_display,
      icd11_biomed_code: record.icd11_biomed_code,
      icd11_biomed_display: record.icd11_biomed_display
    };

    const result = claimsStore.createReviewRequest({
      claimReference,
      system: record.system,
      recordId: record.id,
      code: record.code,
      term: term || record.term,
      reason,
      notes: notes || '',
      requestedBy: requestedBy || (req.user && req.user.username) || 'claims_processor',
      snapshot
    });

    if (result.isDuplicate) {
      return res.status(409).json({
        error: 'DuplicateReviewRequest',
        code: 'DUPLICATE_OPEN_REQUEST',
        message: `An active manual medical review request already exists for claim '${claimReference}' and concept '${record.code}' (${record.term}).`,
        existingRequestId: result.existingRequest ? result.existingRequest.id : null,
        existingRequest: result.existingRequest
      });
    }

    res.status(201).json({
      success: true,
      status: 'success',
      message: `Manual medical review request created for claim '${claimReference}'.`,
      request: result.request
    });
  } catch (error) {
    console.error('[ClaimsController] Error in createClaimReviewRequest:', error);
    res.status(400).json({ error: error.message || 'Failed to create review request.' });
  }
}

module.exports = {
  resolveClaimCode,
  searchClaimsTerms,
  createClaimReviewRequest
};
