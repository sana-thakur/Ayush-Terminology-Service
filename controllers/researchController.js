const { getAllRecords } = require('./terminologyController');
const reviewStore = require('../models/reviewStore');

/**
 * Sanitize cell values for CSV to prevent Spreadsheet Formula Injection (CWE-1236)
 * Prefixes cells starting with '=', '+', '-', or '@' with a single apostrophe.
 */
function sanitizeForCsv(value) {
  if (value === null || value === undefined) {
    return '';
  }
  let str = String(value);

  // Strip or protect dangerous formula prefixes
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }

  // If contains quotes, commas, or newlines, quote and escape quotes
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Shared filtering engine for both paginated queries and full-dataset exports
 */
function filterAndEnrichRecords(records, filters = {}) {
  const {
    system,
    q,
    tm2Code,
    biomedicalCode,
    mappingStatus,
    verificationStatus
  } = filters;

  const queryText = (q || '').trim().toLowerCase();
  const systemFilter = (system || '').trim().toLowerCase();
  const tm2Filter = (tm2Code || '').trim().toLowerCase();
  const biomedFilter = (biomedicalCode || '').trim().toLowerCase();
  const mappingFilter = (mappingStatus || '').trim().toLowerCase();
  const verificationFilter = (verificationStatus || '').trim().toLowerCase();

  const enriched = [];

  for (const item of records) {
    // Exclude any patient/claims fields
    const statusInfo = reviewStore.computeRecordStatus(item);

    const hasTm2 = Boolean(
      item.icd11_tm2_code &&
      item.icd11_tm2_code !== 'N/A' &&
      item.icd11_tm2_display &&
      item.icd11_tm2_display !== 'Not Mapped'
    );

    const hasBiomed = Boolean(
      item.icd11_biomed_code &&
      item.icd11_biomed_code !== 'N/A' &&
      item.icd11_biomed_display &&
      item.icd11_biomed_display !== 'Not Mapped'
    );

    let mappingOutcome = 'unmapped';
    if (hasTm2 && hasBiomed) {
      mappingOutcome = 'mapped';
    } else if (hasTm2 || hasBiomed) {
      mappingOutcome = 'partially_mapped';
    }

    // 1. System tradition filter
    if (systemFilter && systemFilter !== 'all' && item.system.toLowerCase() !== systemFilter) {
      continue;
    }

    // 2. Free-text search filter (term, code, definition, displays)
    if (queryText) {
      const matchText = (
        (item.term || '') + ' ' +
        (item.code || '') + ' ' +
        (item.definition || '') + ' ' +
        (item.icd11_tm2_display || '') + ' ' +
        (item.icd11_biomed_display || '')
      ).toLowerCase();
      if (!matchText.includes(queryText)) {
        continue;
      }
    }

    // 3. TM2 Code filter
    if (tm2Filter && tm2Filter !== 'all') {
      const itemTm2 = (item.icd11_tm2_code || '').toLowerCase();
      if (!itemTm2.includes(tm2Filter)) {
        continue;
      }
    }

    // 4. Biomedical Code filter
    if (biomedFilter && biomedFilter !== 'all') {
      const itemBiomed = (item.icd11_biomed_code || '').toLowerCase();
      if (!itemBiomed.includes(biomedFilter)) {
        continue;
      }
    }

    // 5. Mapping completeness status filter (mapped, partially_mapped, unmapped)
    if (mappingFilter && mappingFilter !== 'all') {
      if (mappingOutcome !== mappingFilter) {
        continue;
      }
    }

    // 6. Clinical verification status filter (verified, flagged, pending_review, unmapped)
    if (verificationFilter && verificationFilter !== 'all') {
      if (statusInfo.status.toLowerCase() !== verificationFilter) {
        continue;
      }
    }

    enriched.push({
      system: item.system,
      id: String(item.id),
      code: item.code,
      term: item.term,
      definition: item.definition,
      compositeKey: reviewStore.getRecordKey(item.system, item.id),
      icd11Tm2: {
        code: item.icd11_tm2_code || 'N/A',
        display: item.icd11_tm2_display || 'Not Mapped',
        isMapped: hasTm2
      },
      icd11Biomedical: {
        code: item.icd11_biomed_code || 'N/A',
        display: item.icd11_biomed_display || 'Not Mapped',
        isMapped: hasBiomed
      },
      mappingStatus: mappingOutcome,
      verificationStatus: statusInfo.status,
      isStale: statusInfo.isStale,
      lastReviewedAt: statusInfo.review ? statusInfo.review.lastReviewedAt : null,
      lastReviewedBy: statusInfo.review ? statusInfo.review.lastReviewedBy : null
    });
  }

  return enriched;
}

/**
 * GET /api/research/records
 * Paginated cohort discovery with multi-parameter filtering
 */
async function getResearchRecords(req, res) {
  try {
    const allRecords = getAllRecords();

    const filters = {
      system: req.query.system || 'all',
      q: req.query.q || '',
      tm2Code: req.query.tm2Code || '',
      biomedicalCode: req.query.biomedicalCode || '',
      mappingStatus: req.query.mappingStatus || 'all',
      verificationStatus: req.query.verificationStatus || 'all'
    };

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '25', 10)));

    const filtered = filterAndEnrichRecords(allRecords, filters);
    const totalMatching = filtered.length;
    const totalPages = Math.ceil(totalMatching / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginated = filtered.slice(startIndex, startIndex + limit);

    res.json({
      status: 'success',
      metadata: {
        totalDatabaseRecords: allRecords.length,
        matchingCount: totalMatching,
        currentPage: page,
        totalPages,
        limit,
        filters,
        queriedAt: new Date().toISOString()
      },
      data: paginated
    });
  } catch (error) {
    console.error('[ResearchController] Error in getResearchRecords:', error);
    res.status(500).json({ error: 'Failed to retrieve research records.' });
  }
}

/**
 * GET /api/research/by-tm2-code?code=...&system=all
 * Cross-tradition exact TM2 code lookup returning linked diagnoses across Ayurveda, Siddha, and Unani
 */
async function getByTm2Code(req, res) {
  try {
    const rawCode = (req.query.code || '').trim();
    const systemFilter = (req.query.system || 'all').trim().toLowerCase();

    // 1. Validation for empty / invalid code
    if (!rawCode) {
      return res.status(400).json({
        status: 'error',
        error: 'InvalidTm2Code',
        message: "A valid non-empty 'code' query parameter is required for TM2 crosswalk lookup."
      });
    }

    // Malformed code check (must be reasonably formatted alphanumeric code, length <= 30)
    if (rawCode.length > 30 || /[\r\n\0]/.test(rawCode)) {
      return res.status(400).json({
        status: 'error',
        error: 'MalformedTm2Code',
        message: 'The specified ICD-11 TM2 code format is malformed or invalid.'
      });
    }

    const allRecords = getAllRecords();
    const upperCode = rawCode.toUpperCase();

    // Exact match lookup - strictly avoid substring false-positives
    const matchedItems = allRecords.filter(item => {
      const itemCode = (item.icd11_tm2_code || '').trim().toUpperCase();
      if (itemCode !== upperCode) {
        return false;
      }
      if (systemFilter && systemFilter !== 'all') {
        return item.system.toLowerCase() === systemFilter;
      }
      return true;
    });

    const enrichedMatches = matchedItems.map(item => {
      const statusInfo = reviewStore.computeRecordStatus(item);
      return {
        system: item.system,
        id: String(item.id),
        code: item.code,
        term: item.term,
        definition: item.definition,
        compositeKey: reviewStore.getRecordKey(item.system, item.id),
        icd11Tm2: {
          code: item.icd11_tm2_code,
          display: item.icd11_tm2_display
        },
        icd11Biomedical: {
          code: item.icd11_biomed_code || 'N/A',
          display: item.icd11_biomed_display || 'Not Mapped'
        },
        verificationStatus: statusInfo.status,
        lastReviewedAt: statusInfo.review ? statusInfo.review.lastReviewedAt : null
      };
    });

    const byTradition = {
      Ayurveda: enrichedMatches.filter(m => m.system.toLowerCase() === 'ayurveda'),
      Siddha: enrichedMatches.filter(m => m.system.toLowerCase() === 'siddha'),
      Unani: enrichedMatches.filter(m => m.system.toLowerCase() === 'unani')
    };

    if (enrichedMatches.length === 0) {
      return res.status(200).json({
        status: 'success',
        searchedCode: rawCode,
        matched: false,
        totalMatches: 0,
        message: `Valid code '${rawCode}' evaluated. No traditional medicine concepts currently map to this ICD-11 TM2 code.`,
        results: [],
        byTradition
      });
    }

    res.status(200).json({
      status: 'success',
      searchedCode: rawCode,
      matched: true,
      totalMatches: enrichedMatches.length,
      traditionsCovered: Object.keys(byTradition).filter(t => byTradition[t].length > 0),
      byTradition,
      results: enrichedMatches
    });
  } catch (error) {
    console.error('[ResearchController] Error in getByTm2Code:', error);
    res.status(500).json({ error: 'Failed to perform TM2 crosswalk lookup.' });
  }
}

/**
 * GET /api/research/export?format=csv (or format=json)
 * Full dataset export using identical filter engine with proper MIME headers & formula injection protection
 */
async function exportDataset(req, res) {
  try {
    const format = (req.query.format || 'csv').trim().toLowerCase();
    const allRecords = getAllRecords();

    const filters = {
      system: req.query.system || 'all',
      q: req.query.q || '',
      tm2Code: req.query.tm2Code || '',
      biomedicalCode: req.query.biomedicalCode || '',
      mappingStatus: req.query.mappingStatus || 'all',
      verificationStatus: req.query.verificationStatus || 'all'
    };

    // Filter all records without pagination
    const filteredRecords = filterAndEnrichRecords(allRecords, filters);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ayush-research-export-${timestamp}.json"`);
      return res.status(200).send(JSON.stringify({
        metadata: {
          title: 'AYUSH Terminology Service (NAMASTE) - Research Export',
          exportTimestamp: new Date().toISOString(),
          recordCount: filteredRecords.length,
          totalDatabaseRecords: allRecords.length,
          activeFilters: filters,
          dataProtection: 'Sanitized research cohort - no patient or claims data included',
          dataSource: 'National AYUSH Morbidity and Standardized Terminologies Electronic Portal'
        },
        records: filteredRecords
      }, null, 2));
    }

    // Default to CSV
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ayush-research-export-${timestamp}.csv"`);

    const headers = [
      'System',
      'NAMASTE_ID',
      'NAMASTE_Code',
      'Term',
      'Definition',
      'ICD11_TM2_Code',
      'ICD11_TM2_Display',
      'Biomedical_Code',
      'Biomedical_Display',
      'Mapping_Status',
      'Verification_Status',
      'Last_Reviewed_At'
    ];

    const lines = [headers.join(',')];

    for (const record of filteredRecords) {
      const row = [
        sanitizeForCsv(record.system),
        sanitizeForCsv(record.id),
        sanitizeForCsv(record.code),
        sanitizeForCsv(record.term),
        sanitizeForCsv(record.definition),
        sanitizeForCsv(record.icd11Tm2.code),
        sanitizeForCsv(record.icd11Tm2.display),
        sanitizeForCsv(record.icd11Biomedical.code),
        sanitizeForCsv(record.icd11Biomedical.display),
        sanitizeForCsv(record.mappingStatus),
        sanitizeForCsv(record.verificationStatus),
        sanitizeForCsv(record.lastReviewedAt || 'N/A')
      ];
      lines.push(row.join(','));
    }

    res.status(200).send(lines.join('\r\n'));
  } catch (error) {
    console.error('[ResearchController] Error in exportDataset:', error);
    res.status(500).json({ error: 'Failed to generate dataset export.' });
  }
}

module.exports = {
  getResearchRecords,
  getByTm2Code,
  exportDataset,
  sanitizeForCsv,
  filterAndEnrichRecords
};
