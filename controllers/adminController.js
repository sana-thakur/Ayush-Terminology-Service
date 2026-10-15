const reviewStore = require('../models/reviewStore');
const claimsStore = require('../models/claimsStore');
const { findRecord, getAllRecords } = require('./terminologyController');

/**
 * GET /api/admin/stats
 * Dashboard summary KPIs
 */
async function getAdminStats(req, res) {
  try {
    const allRecords = getAllRecords();
    const stats = reviewStore.getSummaryStats(allRecords);
    res.json({
      status: 'success',
      stats
    });
  } catch (error) {
    console.error('[AdminController] Error retrieving stats:', error);
    res.status(500).json({ error: 'Failed to retrieve administrative statistics.' });
  }
}

/**
 * GET /api/admin/mappings
 * List all mappings with admin verification status, completeness, and pagination/filtering
 */
async function getAllMappings(req, res) {
  try {
    const allRecords = getAllRecords();
    const systemFilter = (req.query.system || '').toLowerCase();
    const statusFilter = (req.query.status || '').toLowerCase();
    const q = (req.query.q || '').toLowerCase();

    let filtered = allRecords.map(record => {
      const statusInfo = reviewStore.computeRecordStatus(record);
      return {
        ...record,
        compositeKey: reviewStore.getRecordKey(record.system, record.id),
        reviewStatus: statusInfo.status,
        completeness: statusInfo.completeness,
        isStale: statusInfo.isStale
      };
    });

    if (systemFilter && systemFilter !== 'all') {
      filtered = filtered.filter(r => r.system.toLowerCase() === systemFilter);
    }
    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter(r => r.reviewStatus === statusFilter);
    }
    if (q) {
      filtered = filtered.filter(r =>
        (r.term && r.term.toLowerCase().includes(q)) ||
        (r.code && r.code.toLowerCase().includes(q)) ||
        (r.definition && r.definition.toLowerCase().includes(q))
      );
    }

    res.json({
      status: 'success',
      total: filtered.length,
      data: filtered
    });
  } catch (error) {
    console.error('[AdminController] Error retrieving mappings:', error);
    res.status(500).json({ error: 'Failed to retrieve mappings.' });
  }
}

/**
 * GET /api/admin/mappings/:system/:id
 * Retrieve specific terminology record, mapping details, completeness, review status, and review history
 */
async function getMappingRecord(req, res) {
  try {
    const { system, id } = req.params;
    const record = findRecord(system, id);

    if (!record) {
      return res.status(404).json({
        error: 'RecordNotFound',
        message: `Terminology record not found for system '${system}' and ID '${id}'.`
      });
    }

    const statusInfo = reviewStore.computeRecordStatus(record);
    const history = reviewStore.getHistory(system, id);
    const currentFingerprint = reviewStore.computeMappingFingerprint(record);

    const hasTm2 = Boolean(record.icd11_tm2_code && record.icd11_tm2_code !== 'N/A' && record.icd11_tm2_display !== 'Not Mapped');
    const hasBiomed = Boolean(record.icd11_biomed_code && record.icd11_biomed_code !== 'N/A' && record.icd11_biomed_display !== 'Not Mapped');

    res.json({
      compositeKey: reviewStore.getRecordKey(record.system, record.id),
      record,
      mappingDetails: {
        hasTm2Mapping: hasTm2,
        hasBiomedMapping: hasBiomed,
        tm2: {
          code: record.icd11_tm2_code || 'N/A',
          display: record.icd11_tm2_display || 'Not Mapped'
        },
        biomed: {
          code: record.icd11_biomed_code || 'N/A',
          display: record.icd11_biomed_display || 'Not Mapped'
        },
        currentFingerprint
      },
      completeness: statusInfo.completeness,
      reviewStatus: statusInfo.status,
      isStale: statusInfo.isStale,
      staleReason: statusInfo.staleReason,
      review: statusInfo.review,
      history
    });
  } catch (error) {
    console.error('[AdminController] Error retrieving mapping record:', error);
    res.status(500).json({ error: 'Internal server error while fetching mapping record.' });
  }
}

/**
 * POST /api/admin/mappings/:system/:id/verify
 * Require admin auth. Validate that record exists and has valid mapping info before marking as 'verified'
 */
async function verifyMapping(req, res) {
  try {
    const { system, id } = req.params;
    const record = findRecord(system, id);

    if (!record) {
      return res.status(404).json({
        error: 'RecordNotFound',
        message: `Terminology record not found for system '${system}' and ID '${id}'.`
      });
    }

    // Validate that record has valid mapping info
    if (!reviewStore.hasValidMapping(record)) {
      return res.status(400).json({
        error: 'UnmappedRecordVerificationRejected',
        message: 'Cannot verify record: Record lacks valid ICD-11 TM2 or Biomedical mapping. Only mapped records may be verified.'
      });
    }

    const notes = req.body && req.body.notes ? String(req.body.notes).trim() : '';
    const reviewer = (req.adminUser && req.adminUser.username) || (req.body && req.body.reviewer) || 'admin';

    const result = reviewStore.verifyRecord(record, { notes, reviewer });

    res.status(200).json({
      status: 'success',
      message: `Mapping for '${record.term}' (${record.code}) verified successfully.`,
      reviewStatus: result.statusInfo.status,
      isStale: result.statusInfo.isStale,
      review: result.review
    });
  } catch (error) {
    console.error('[AdminController] Error verifying mapping:', error);
    res.status(400).json({ error: error.message || 'Failed to verify mapping.' });
  }
}

/**
 * POST /api/admin/mappings/:system/:id/flag
 * Allow flagging incorrect/missing mappings with a reason category, description, and optional suggestion,
 * setting status to 'flagged' without altering original source data.
 */
async function flagMapping(req, res) {
  try {
    const { system, id } = req.params;
    const record = findRecord(system, id);

    if (!record) {
      return res.status(404).json({
        error: 'RecordNotFound',
        message: `Terminology record not found for system '${system}' and ID '${id}'.`
      });
    }

    const { reasonCategory, description, suggestion } = req.body || {};

    if (!reasonCategory) {
      return res.status(400).json({
        error: 'MissingReasonCategory',
        message: 'A valid reason category is required to flag a mapping (e.g. incorrect_mapping, missing_icd11_tm2_mapping, missing_biomed_mapping, ambiguous_concept, outdated_terminology, other).'
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        error: 'MissingDescription',
        message: 'A description of the issue must be provided when flagging a mapping.'
      });
    }

    const reviewer = (req.adminUser && req.adminUser.username) || (req.body && req.body.reviewer) || 'admin';

    const result = reviewStore.flagRecord(record, {
      reasonCategory,
      description,
      suggestion,
      reviewer
    });

    res.status(200).json({
      status: 'success',
      message: `Mapping for '${record.term}' (${record.code}) flagged as '${reasonCategory}'. Original source data remains intact.`,
      reviewStatus: result.statusInfo.status,
      review: result.review
    });
  } catch (error) {
    console.error('[AdminController] Error flagging mapping:', error);
    res.status(400).json({ error: error.message || 'Failed to flag mapping.' });
  }
}

/**
 * GET /api/admin/mappings/:system/:id/history
 * Retrieve ordered action history
 */
async function getMappingHistory(req, res) {
  try {
    const { system, id } = req.params;
    const record = findRecord(system, id);

    if (!record) {
      return res.status(404).json({
        error: 'RecordNotFound',
        message: `Terminology record not found for system '${system}' and ID '${id}'.`
      });
    }

    const history = reviewStore.getHistory(system, id);
    const key = reviewStore.getRecordKey(system, id);

    res.json({
      compositeKey: key,
      system: record.system,
      id: record.id,
      code: record.code,
      term: record.term,
      historyCount: history.length,
      history
    });
  } catch (error) {
    console.error('[AdminController] Error retrieving mapping history:', error);
    res.status(500).json({ error: 'Internal server error while fetching action history.' });
  }
}

/**
 * GET /api/admin/claims-review-requests
 * Retrieve insurance claims manual medical review requests
 */
async function getClaimsReviewRequests(req, res) {
  try {
    const { status, system, claimReference } = req.query;
    const requests = claimsStore.getReviewRequests({ status, system, claimReference });
    const stats = claimsStore.getClaimsStats();

    res.json({
      status: 'success',
      total: requests.length,
      stats,
      requests
    });
  } catch (error) {
    console.error('[AdminController] Error retrieving claims review requests:', error);
    res.status(500).json({ error: 'Failed to retrieve claims review requests.' });
  }
}

/**
 * PATCH /api/admin/claims-review-requests/:id
 * Update status and record adjudication resolution for a claim review request
 */
async function updateClaimsReviewRequest(req, res) {
  try {
    const { id } = req.params;
    const { status, resolutionOutcome, resolutionNotes, reviewer } = req.body || {};

    const reviewerName = (req.adminUser && req.adminUser.username) || reviewer || 'admin';

    const updated = claimsStore.updateReviewRequest(id, {
      status,
      resolutionOutcome,
      resolutionNotes,
      reviewer: reviewerName
    });

    res.json({
      status: 'success',
      message: `Claims review request '${id}' updated successfully.`,
      request: updated
    });
  } catch (error) {
    console.error('[AdminController] Error updating claims review request:', error);
    res.status(400).json({ error: error.message || 'Failed to update claims review request.' });
  }
}

module.exports = {
  getAdminStats,
  getAllMappings,
  getMappingRecord,
  verifyMapping,
  flagMapping,
  getMappingHistory,
  getClaimsReviewRequests,
  updateClaimsReviewRequest
};
