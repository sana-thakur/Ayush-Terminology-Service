const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', 'data');
const reviewFilePath = path.join(dataDir, 'mapping-reviews.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// In-memory cache for fast lookups
let reviewsCache = {};

/**
 * Generate a consistent composite record key
 * System + ID (e.g. "ayurveda-1", "siddha-2", "unani-1")
 */
function getRecordKey(system, id) {
  if (!system || !id) return '';
  return `${String(system).toLowerCase().trim()}-${String(id).trim()}`;
}

/**
 * Calculate a deterministic fingerprint for a record's mapping state
 * Covers code, term, TM2 code/display, and Biomedicine code/display
 */
function computeMappingFingerprint(record) {
  if (!record) return '';
  const payload = [
    (record.system || '').trim().toLowerCase(),
    String(record.id || '').trim(),
    (record.code || '').trim(),
    (record.term || '').trim(),
    (record.icd11_tm2_code || '').trim(),
    (record.icd11_tm2_display || '').trim(),
    (record.icd11_biomed_code || '').trim(),
    (record.icd11_biomed_display || '').trim()
  ].join('::');

  return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
}

/**
 * Safely initialize mapping-reviews.json if not present
 * Reads and populates in-memory cache
 */
function initReviewStore() {
  try {
    if (!fs.existsSync(reviewFilePath)) {
      const initialData = {
        version: 1,
        description: 'Persistent review and verification audit store for AYUSH-ICD11 mappings',
        lastUpdated: new Date().toISOString(),
        reviews: {}
      };
      atomicWrite(initialData);
      reviewsCache = initialData.reviews;
      console.log('[ReviewStore] Initialized mapping-reviews.json successfully.');
    } else {
      const content = fs.readFileSync(reviewFilePath, 'utf8');
      const parsed = JSON.parse(content);
      reviewsCache = parsed.reviews || {};
      console.log(`[ReviewStore] Loaded ${Object.keys(reviewsCache).length} existing reviews from mapping-reviews.json.`);
    }
  } catch (error) {
    console.error('[ReviewStore] Error initializing mapping-reviews.json:', error);
    reviewsCache = {};
  }
}

/**
 * Perform atomic write using a temp file and fs.renameSync
 */
function atomicWrite(data) {
  const tmpPath = path.join(dataDir, `mapping-reviews.json.tmp.${Date.now()}.${process.pid}`);
  const payload = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, payload, 'utf8');
  fs.renameSync(tmpPath, reviewFilePath);
}

/**
 * Persist the current in-memory review cache atomically
 */
function persistReviews() {
  const data = {
    version: 1,
    description: 'Persistent review and verification audit store for AYUSH-ICD11 mappings',
    lastUpdated: new Date().toISOString(),
    reviews: reviewsCache
  };
  atomicWrite(data);
}

/**
 * Determine completeness of mapping
 */
function getMappingCompleteness(record) {
  if (!record) return 'unmapped';
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

  if (hasTm2 && hasBiomed) return 'complete';
  if (hasTm2 || hasBiomed) return 'partial';
  return 'unmapped';
}

/**
 * Check if record has valid mapping information that can be verified
 */
function hasValidMapping(record) {
  const completeness = getMappingCompleteness(record);
  return completeness === 'complete' || completeness === 'partial';
}

/**
 * Compute the effective review status of a record
 * Returns { status, isStale, staleReason, completeness, review }
 */
function computeRecordStatus(record) {
  if (!record) return { status: 'unmapped', isStale: false, completeness: 'unmapped', review: null };

  const key = getRecordKey(record.system, record.id);
  const review = reviewsCache[key] || null;
  const completeness = getMappingCompleteness(record);
  const currentFingerprint = computeMappingFingerprint(record);

  if (review) {
    if (review.status === 'flagged') {
      const isStale = review.mappingFingerprint && review.mappingFingerprint !== currentFingerprint;
      return {
        status: 'flagged',
        isStale,
        staleReason: isStale ? 'Data has changed since mapping was flagged' : null,
        completeness,
        review
      };
    }

    if (review.status === 'verified') {
      const isFingerprintMatch = review.mappingFingerprint === currentFingerprint;
      if (isFingerprintMatch) {
        return {
          status: 'verified',
          isStale: false,
          staleReason: null,
          completeness,
          review
        };
      } else {
        // Verification is stale because underlying data changed!
        return {
          status: 'pending_review',
          isStale: true,
          staleReason: 'Underlying terminology or mapping data changed after verification',
          completeness,
          review
        };
      }
    }
  }

  // No review present
  if (completeness === 'unmapped') {
    return {
      status: 'unmapped',
      isStale: false,
      staleReason: null,
      completeness,
      review: null
    };
  }

  return {
    status: 'pending_review',
    isStale: false,
    staleReason: null,
    completeness,
    review: null
  };
}

/**
 * Verify a record
 */
function verifyRecord(record, { notes = '', reviewer = 'admin' } = {}) {
  if (!record) {
    throw new Error('Record does not exist.');
  }

  if (!hasValidMapping(record)) {
    throw new Error('Cannot verify record: no valid ICD-11 TM2 or Biomedical mapping exists.');
  }

  const key = getRecordKey(record.system, record.id);
  const currentFingerprint = computeMappingFingerprint(record);
  const now = new Date().toISOString();

  const existingReview = reviewsCache[key] || {
    recordKey: key,
    system: record.system,
    id: String(record.id),
    history: []
  };

  const actionEntry = {
    id: `rev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    action: 'VERIFIED',
    status: 'verified',
    timestamp: now,
    reviewer: reviewer || 'admin',
    notes: notes ? notes.trim() : 'Verified by administrator',
    mappingFingerprint: currentFingerprint,
    mappingSnapshot: {
      code: record.code,
      term: record.term,
      icd11_tm2_code: record.icd11_tm2_code,
      icd11_tm2_display: record.icd11_tm2_display,
      icd11_biomed_code: record.icd11_biomed_code,
      icd11_biomed_display: record.icd11_biomed_display
    }
  };

  const updatedReview = {
    ...existingReview,
    recordKey: key,
    system: record.system,
    id: String(record.id),
    status: 'verified',
    mappingFingerprint: currentFingerprint,
    lastReviewedAt: now,
    lastReviewedBy: reviewer || 'admin',
    lastNotes: notes ? notes.trim() : '',
    flagDetails: null, // Clear any previous flag on successful verification
    history: [actionEntry, ...(existingReview.history || [])]
  };

  reviewsCache[key] = updatedReview;
  persistReviews();

  return {
    review: updatedReview,
    statusInfo: computeRecordStatus(record)
  };
}

/**
 * Flag a record
 */
function flagRecord(record, { reasonCategory, description, suggestion = '', reviewer = 'admin' } = {}) {
  if (!record) {
    throw new Error('Record does not exist.');
  }

  const validCategories = [
    'incorrect_mapping',
    'missing_icd11_tm2_mapping',
    'missing_biomed_mapping',
    'ambiguous_concept',
    'outdated_terminology',
    'other'
  ];

  if (!reasonCategory || !validCategories.includes(reasonCategory)) {
    throw new Error(`Invalid reason category. Must be one of: ${validCategories.join(', ')}`);
  }

  if (!description || !description.trim()) {
    throw new Error('Description is required when flagging a mapping issue.');
  }

  const key = getRecordKey(record.system, record.id);
  const currentFingerprint = computeMappingFingerprint(record);
  const now = new Date().toISOString();

  const existingReview = reviewsCache[key] || {
    recordKey: key,
    system: record.system,
    id: String(record.id),
    history: []
  };

  const actionEntry = {
    id: `flag-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    action: 'FLAGGED',
    status: 'flagged',
    timestamp: now,
    reviewer: reviewer || 'admin',
    reasonCategory: reasonCategory,
    description: description.trim(),
    suggestion: suggestion ? suggestion.trim() : '',
    mappingFingerprint: currentFingerprint,
    mappingSnapshot: {
      code: record.code,
      term: record.term,
      icd11_tm2_code: record.icd11_tm2_code,
      icd11_tm2_display: record.icd11_tm2_display,
      icd11_biomed_code: record.icd11_biomed_code,
      icd11_biomed_display: record.icd11_biomed_display
    }
  };

  const updatedReview = {
    ...existingReview,
    recordKey: key,
    system: record.system,
    id: String(record.id),
    status: 'flagged',
    mappingFingerprint: currentFingerprint,
    lastReviewedAt: now,
    lastReviewedBy: reviewer || 'admin',
    flagDetails: {
      reasonCategory: reasonCategory,
      description: description.trim(),
      suggestion: suggestion ? suggestion.trim() : '',
      flaggedAt: now
    },
    history: [actionEntry, ...(existingReview.history || [])]
  };

  reviewsCache[key] = updatedReview;
  persistReviews();

  return {
    review: updatedReview,
    statusInfo: computeRecordStatus(record)
  };
}

/**
 * Get review record by system and id
 */
function getReview(system, id) {
  const key = getRecordKey(system, id);
  return reviewsCache[key] || null;
}

/**
 * Get ordered history for a record
 */
function getHistory(system, id) {
  const review = getReview(system, id);
  if (!review || !review.history) {
    return [];
  }
  // Return sorted newest first
  return [...review.history].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Calculate dashboard summary statistics
 */
function getSummaryStats(records = []) {
  let verified = 0;
  let flagged = 0;
  let pendingReview = 0;
  let unmapped = 0;
  let stale = 0;

  const systemCounts = {
    Ayurveda: { total: 0, verified: 0, flagged: 0, pending: 0, unmapped: 0 },
    Siddha: { total: 0, verified: 0, flagged: 0, pending: 0, unmapped: 0 },
    Unani: { total: 0, verified: 0, flagged: 0, pending: 0, unmapped: 0 }
  };

  records.forEach(item => {
    const statusInfo = computeRecordStatus(item);
    const sys = item.system || 'Unknown';
    if (!systemCounts[sys]) {
      systemCounts[sys] = { total: 0, verified: 0, flagged: 0, pending: 0, unmapped: 0 };
    }
    systemCounts[sys].total++;

    if (statusInfo.isStale) {
      stale++;
    }

    if (statusInfo.status === 'verified') {
      verified++;
      systemCounts[sys].verified++;
    } else if (statusInfo.status === 'flagged') {
      flagged++;
      systemCounts[sys].flagged++;
    } else if (statusInfo.status === 'unmapped') {
      unmapped++;
      systemCounts[sys].unmapped++;
    } else {
      pendingReview++;
      systemCounts[sys].pending++;
    }
  });

  return {
    totalRecords: records.length,
    verified,
    flagged,
    pendingReview,
    unmapped,
    staleVerifications: stale,
    bySystem: systemCounts
  };
}

// Initialize on module load
initReviewStore();

module.exports = {
  initReviewStore,
  getRecordKey,
  computeMappingFingerprint,
  getMappingCompleteness,
  hasValidMapping,
  computeRecordStatus,
  verifyRecord,
  flagRecord,
  getReview,
  getHistory,
  getSummaryStats
};
