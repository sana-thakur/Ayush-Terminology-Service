const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', 'data');
const claimsFilePath = path.join(dataDir, 'claims-review-requests.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let requestsCache = [];

/**
 * Safely initialize claims-review-requests.json if not present
 */
function initClaimsStore() {
  try {
    if (!fs.existsSync(claimsFilePath)) {
      const initialData = {
        version: 1,
        description: 'Insurance claims manual medical review requests and adjudication audit store',
        lastUpdated: new Date().toISOString(),
        requests: []
      };
      atomicWrite(initialData);
      requestsCache = initialData.requests;
      console.log('[ClaimsStore] Initialized claims-review-requests.json successfully.');
    } else {
      const content = fs.readFileSync(claimsFilePath, 'utf8');
      const parsed = JSON.parse(content);
      requestsCache = Array.isArray(parsed.requests) ? parsed.requests : [];
      console.log(`[ClaimsStore] Loaded ${requestsCache.length} existing claims review requests.`);
    }
  } catch (error) {
    console.error('[ClaimsStore] Error initializing claims-review-requests.json:', error);
    requestsCache = [];
  }
}

/**
 * Perform atomic write using a temp file and fs.renameSync
 */
function atomicWrite(data) {
  const tmpPath = path.join(dataDir, `claims-review-requests.json.tmp.${Date.now()}.${process.pid}`);
  const payload = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, payload, 'utf8');
  fs.renameSync(tmpPath, claimsFilePath);
}

/**
 * Persist current in-memory requests cache atomically
 */
function persistRequests() {
  const data = {
    version: 1,
    description: 'Insurance claims manual medical review requests and adjudication audit store',
    lastUpdated: new Date().toISOString(),
    requests: requestsCache
  };
  atomicWrite(data);
}

/**
 * Generate a consistent record key (e.g., 'ayurveda-1')
 */
function getRecordKey(system, id) {
  if (!system || !id) return '';
  return `${String(system).toLowerCase().trim()}-${String(id).trim()}`;
}

/**
 * Create a manual medical review request
 * Enforces deduplication for the same claimReference + record combination
 */
function createReviewRequest({
  claimReference,
  system,
  recordId,
  code,
  term,
  reason,
  notes = '',
  requestedBy = 'claims_processor',
  resolutionOutcome = 'unmapped',
  snapshot = null
}) {
  if (!claimReference || !String(claimReference).trim()) {
    throw new Error('claimReference is required.');
  }
  if (!system || !String(system).trim()) {
    throw new Error('system (tradition) is required.');
  }
  if (!recordId) {
    throw new Error('recordId is required.');
  }
  if (!code || !String(code).trim()) {
    throw new Error('NAMASTE code is required.');
  }
  if (!reason || !String(reason).trim()) {
    throw new Error('Reason category is required.');
  }

  const cleanClaimRef = String(claimReference).trim();
  const cleanSystem = String(system).trim();
  const cleanRecordId = String(recordId).trim();
  const cleanCode = String(code).trim();
  const recordKey = getRecordKey(cleanSystem, cleanRecordId);

  // Deduplication check: check for active review requests (pending_review or under_review)
  // for the same claimReference and record (by recordKey or system+code)
  const existingActive = requestsCache.find(r =>
    r.claimReference.toLowerCase() === cleanClaimRef.toLowerCase() &&
    (r.recordKey === recordKey || (r.system.toLowerCase() === cleanSystem.toLowerCase() && r.code.toLowerCase() === cleanCode.toLowerCase())) &&
    ['pending_review', 'under_review'].includes(r.status)
  );

  if (existingActive) {
    return {
      isDuplicate: true,
      existingRequest: existingActive
    };
  }

  const now = new Date().toISOString();
  const newId = `crr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  const newRequest = {
    id: newId,
    claimReference: cleanClaimRef,
    system: cleanSystem,
    recordId: cleanRecordId,
    recordKey: recordKey,
    code: cleanCode,
    term: term ? String(term).trim() : '',
    reason: String(reason).trim(),
    notes: String(notes).trim(),
    requestedBy: String(requestedBy).trim(),
    resolutionOutcome: resolutionOutcome,
    status: 'pending_review', // pending_review | under_review | resolved | closed
    adjudication: null, // Populated upon admin resolution
    createdAt: now,
    updatedAt: now,
    snapshot: snapshot || {},
    history: [
      {
        timestamp: now,
        action: 'SUBMITTED',
        status: 'pending_review',
        actor: String(requestedBy).trim(),
        notes: String(notes).trim() || 'Review request submitted by claims processor'
      }
    ]
  };

  requestsCache.unshift(newRequest);
  persistRequests();

  return {
    isDuplicate: false,
    request: newRequest
  };
}

/**
 * Retrieve review requests with optional filters
 */
function getReviewRequests({ status, system, claimReference } = {}) {
  let list = [...requestsCache];

  if (status && status !== 'all') {
    const sFilter = String(status).trim().toLowerCase();
    list = list.filter(r => r.status.toLowerCase() === sFilter);
  }

  if (system && system !== 'all') {
    const sysFilter = String(system).trim().toLowerCase();
    list = list.filter(r => r.system.toLowerCase() === sysFilter);
  }

  if (claimReference) {
    const refFilter = String(claimReference).trim().toLowerCase();
    list = list.filter(r => r.claimReference.toLowerCase().includes(refFilter));
  }

  // Chronologically newest first
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Retrieve a specific review request by ID
 */
function getReviewRequestById(id) {
  if (!id) return null;
  return requestsCache.find(r => r.id === String(id).trim()) || null;
}

/**
 * Update review request status and append resolution notes
 */
function updateReviewRequest(id, {
  status,
  resolutionOutcome,
  resolutionNotes = '',
  reviewer = 'admin'
}) {
  const request = getReviewRequestById(id);
  if (!request) {
    throw new Error(`Review request with ID '${id}' not found.`);
  }

  const validStatuses = ['pending_review', 'under_review', 'resolved', 'closed'];
  if (status && !validStatuses.includes(status)) {
    throw new Error(`Invalid status '${status}'. Must be one of: ${validStatuses.join(', ')}`);
  }

  const now = new Date().toISOString();
  const previousStatus = request.status;
  const newStatus = status || request.status;

  if (resolutionOutcome || resolutionNotes) {
    request.adjudication = {
      outcome: resolutionOutcome || (request.adjudication && request.adjudication.outcome) || 'adjudicated',
      notes: resolutionNotes ? String(resolutionNotes).trim() : '',
      adjudicatedAt: now,
      adjudicatedBy: String(reviewer).trim()
    };
  }

  request.status = newStatus;
  request.updatedAt = now;

  request.history = request.history || [];
  request.history.unshift({
    timestamp: now,
    action: `STATUS_CHANGE_TO_${newStatus.toUpperCase()}`,
    status: newStatus,
    previousStatus,
    actor: String(reviewer).trim(),
    notes: resolutionNotes ? String(resolutionNotes).trim() : `Status changed from ${previousStatus} to ${newStatus}`
  });

  persistRequests();

  return request;
}

/**
 * Summary stats for claims review requests
 */
function getClaimsStats() {
  const stats = {
    total: requestsCache.length,
    pending_review: 0,
    under_review: 0,
    resolved: 0,
    closed: 0,
    bySystem: {
      Ayurveda: 0,
      Siddha: 0,
      Unani: 0
    }
  };

  requestsCache.forEach(r => {
    if (stats[r.status] !== undefined) {
      stats[r.status]++;
    }
    const sys = r.system;
    if (stats.bySystem[sys] !== undefined) {
      stats.bySystem[sys]++;
    }
  });

  return stats;
}

// Initialize on module load
initClaimsStore();

module.exports = {
  initClaimsStore,
  getRecordKey,
  createReviewRequest,
  getReviewRequests,
  getReviewRequestById,
  updateReviewRequest,
  getClaimsStats
};
