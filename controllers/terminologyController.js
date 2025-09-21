const fs = require('fs');
const path = require('path');
const fhirGenerator = require('../utils/fhirGenerator');

let searchIndex = [];

// --- Data Loading ---
function loadData() {
  const dataPath = path.join(__dirname, '..', 'data', 'search-index.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error('Search index not found. Please run "npm run ingest" first.');
  }
  searchIndex = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}

// --- Controller Functions ---

// 1. Autocomplete Search (NOW SEARCHES CODES AS WELL)
async function searchTerm(req, res) {
  const query = (req.query.q || '').toLowerCase();
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '50', 10);

  const filteredResults = query
    ? searchIndex.filter(item =>
      // --- UPDATED SEARCH LOGIC ---
      (item.definition && item.definition.toLowerCase().includes(query)) ||
      (item.term && item.term.toLowerCase().includes(query)) ||
      (item.icd11_biomed_display && item.icd11_biomed_display.toLowerCase().includes(query)) ||
      (item.code && item.code.toLowerCase().includes(query)) || // Search NAMASTE code
      (item.icd11_tm2_code && item.icd11_tm2_code.toLowerCase().includes(query)) || // Search TM2 code
      (item.icd11_biomed_code && item.icd11_biomed_code.toLowerCase().includes(query)) // Search Biomed code
    )
    : searchIndex;

  const totalResults = filteredResults.length;
  const totalPages = Math.ceil(totalResults / limit);

  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedResults = filteredResults.slice(startIndex, endIndex);

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

// --- Other functions remain the same ---
// (No changes needed for getCodeSystem, getConceptMap, or translateCode)

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
  searchTerm,
  getCodeSystem,
  getConceptMap,
  translateCode
};
