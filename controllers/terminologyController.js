const fs = require('fs');
const path = require('path');
const fhirGenerator = require('../utils/fhirGenerator');
const reviewStore = require('../models/reviewStore');

let searchIndex = [];

// --- Data Loading ---
function loadData() {
  const dataPath = path.join(__dirname, '..', 'data', 'search-index.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error('Search index not found. Please run "npm run ingest" first.');
  }
  searchIndex = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  reviewStore.initReviewStore();
}

function getAllRecords() {
  return searchIndex;
}

function findRecord(system, id) {
  if (!system || !id) return null;
  const targetSys = String(system).trim().toLowerCase();
  const targetId = String(id).trim();

  return searchIndex.find(item =>
    item.system.toLowerCase() === targetSys && String(item.id).trim() === targetId
  ) || null;
}

// --- Controller Functions ---

// 1. Autocomplete & Advanced Search
// Supports:
// - q: search text across term, definition, NAMASTE code, TM2 code/display, Biomed code/display
// - system: filter by tradition (Ayurveda, Siddha, Unani, or all)
// - status: filter by review status (verified, flagged, pending_review, unmapped, or all)
// - page, limit: pagination
async function searchTerm(req, res) {
  const query = (req.query.q || '').trim().toLowerCase();
  const systemFilter = (req.query.system || '').trim().toLowerCase();
  const statusFilter = (req.query.status || '').trim().toLowerCase();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '50', 10)));

  // Enrich & filter records
  let filteredResults = searchIndex;

  // 1. Filter by Tradition / System
  if (systemFilter && systemFilter !== 'all') {
    filteredResults = filteredResults.filter(item =>
      item.system && item.system.toLowerCase() === systemFilter
    );
  }

  // 2. Filter by Search Query
  if (query) {
    filteredResults = filteredResults.filter(item =>
      (item.definition && item.definition.toLowerCase().includes(query)) ||
      (item.term && item.term.toLowerCase().includes(query)) ||
      (item.code && item.code.toLowerCase().includes(query)) ||
      (item.icd11_tm2_code && item.icd11_tm2_code.toLowerCase().includes(query)) ||
      (item.icd11_tm2_display && item.icd11_tm2_display.toLowerCase().includes(query)) ||
      (item.icd11_biomed_code && item.icd11_biomed_code.toLowerCase().includes(query)) ||
      (item.icd11_biomed_display && item.icd11_biomed_display.toLowerCase().includes(query))
    );
  }

  // 3. Map status and filter by Status if requested
  const enrichedResults = [];
  for (const item of filteredResults) {
    const statusInfo = reviewStore.computeRecordStatus(item);
    const enriched = {
      ...item,
      composite_key: reviewStore.getRecordKey(item.system, item.id),
      review_status: statusInfo.status,
      is_stale: statusInfo.isStale,
      stale_reason: statusInfo.staleReason,
      mapping_completeness: statusInfo.completeness,
      current_fingerprint: reviewStore.computeMappingFingerprint(item),
      review_details: statusInfo.review ? {
        status: statusInfo.review.status,
        lastReviewedAt: statusInfo.review.lastReviewedAt,
        lastReviewedBy: statusInfo.review.lastReviewedBy,
        lastNotes: statusInfo.review.lastNotes,
        flagDetails: statusInfo.review.flagDetails,
        historyCount: (statusInfo.review.history || []).length
      } : null
    };

    if (!statusFilter || statusFilter === 'all' || enriched.review_status.toLowerCase() === statusFilter) {
      enrichedResults.push(enriched);
    }
  }

  const totalResults = enrichedResults.length;
  const totalPages = Math.ceil(totalResults / limit) || 1;

  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedResults = enrichedResults.slice(startIndex, endIndex);

  res.json({
    pagination: {
      currentPage: page,
      totalPages: totalPages,
      totalResults: totalResults,
      limit: limit
    },
    results: paginatedResults
  });
}

// --- FHIR endpoints ---

async function getCodeSystem(req, res) {
  const codeSystem = fhirGenerator.generateCodeSystem(searchIndex);
  res.json(codeSystem);
}

async function getConceptMap(req, res) {
  const conceptMap = fhirGenerator.generateConceptMap(searchIndex);
  res.json(conceptMap);
}

async function translateCode(req, res) {
  const { system, code } = req.query;

  if (!system || !code) {
    return res.status(400).json({ error: "Missing 'system' or 'code' query parameters." });
  }

  const foundTerm = searchIndex.find(term => term.code === code && term.system.toLowerCase() === system.split('/').pop().toLowerCase());

  if (!foundTerm || foundTerm.icd11_tm2_code === 'N/A') {
    return res.json({
      result: false,
      message: 'No mapping found for the given code.',
    });
  }

  const parametersResponse = {
    resourceType: 'Parameters',
    parameter: [{ name: 'result', valueBoolean: true }, {
      name: 'match',
      part: [
        { name: 'equivalence', valueCode: 'equivalent' },
        { name: 'concept', valueCoding: { system: 'http://id.who.int/icd/entity/tm', code: foundTerm.icd11_tm2_code, display: foundTerm.icd11_tm2_display } },
        { name: 'concept', valueCoding: { system: 'http://id.who.int/icd/entity/', code: foundTerm.icd11_biomed_code, display: foundTerm.icd11_biomed_display } }
      ]
    }]
  };

  res.json(parametersResponse);
}

module.exports = {
  loadData,
  getAllRecords,
  findRecord,
  searchTerm,
  getCodeSystem,
  getConceptMap,
  translateCode
};

