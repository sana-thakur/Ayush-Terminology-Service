const http = require('http');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, rawBody: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data, rawBody: data });
        }
      });
    });
    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runResearchTests() {
  console.log('--- Starting Researcher Portal & Unified Query Service Integration Tests ---');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  const DEV_TOKEN = 'researcher-secret-dev-token-2026';
  const AUTH_HEADERS = { 'Authorization': `Bearer ${DEV_TOKEN}` };

  try {
    // 1. Auth Protection
    console.log('\nTest 1: GET /api/research/records without auth');
    const resNoAuth = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/research/records',
      method: 'GET'
    });
    assert(resNoAuth.status === 401, 'Unauthorized request rejected with HTTP 401');

    // 2. Auth with query token
    console.log('\nTest 2: GET /api/research/records with ?token= query parameter');
    const resQueryToken = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/research/records?token=${DEV_TOKEN}&limit=5`,
      method: 'GET'
    });
    assert(resQueryToken.status === 200, 'Authenticated via query token returns HTTP 200');
    assert(Array.isArray(resQueryToken.body.data), 'Returns data array');
    assert(resQueryToken.body.data.length === 5, 'Respects limit parameter');

    // 3. Single-Tradition Filtering & Cohort Discovery
    console.log('\nTest 3: Tradition Filtering');
    const resAyu = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/research/records?system=Ayurveda&limit=50',
      method: 'GET',
      headers: AUTH_HEADERS
    });
    assert(resAyu.status === 200, 'Ayurveda query returns HTTP 200');
    assert(resAyu.body.metadata.matchingCount === 15, `Ayurveda matching count is 15 (got ${resAyu.body.metadata.matchingCount})`);
    assert(resAyu.body.data.every(r => r.system.toLowerCase() === 'ayurveda'), 'All records belong to Ayurveda');

    const resSiddha = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/research/records?system=Siddha&limit=50',
      method: 'GET',
      headers: AUTH_HEADERS
    });
    assert(resSiddha.body.metadata.matchingCount === 15, 'Siddha matching count is 15');

    const resUnani = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/research/records?system=Unani&limit=50',
      method: 'GET',
      headers: AUTH_HEADERS
    });
    assert(resUnani.body.metadata.matchingCount === 15, 'Unani matching count is 15');

    // 4. Pagination Consistency
    console.log('\nTest 4: Pagination Consistency');
    const resPage1 = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/research/records?page=1&limit=10',
      method: 'GET',
      headers: AUTH_HEADERS
    });
    const resPage2 = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/research/records?page=2&limit=10',
      method: 'GET',
      headers: AUTH_HEADERS
    });
    assert(resPage1.body.data.length === 10, 'Page 1 has 10 records');
    assert(resPage2.body.data.length === 10, 'Page 2 has 10 records');
    assert(resPage1.body.metadata.totalPages === 5, 'Total pages calculated correctly (5 for 45 records at 10/page)');
    assert(resPage1.body.data[0].id !== resPage2.body.data[0].id, 'Page 1 and Page 2 records are distinct');

    // 5. Cross-Tradition Exact TM2 Code Lookup
    console.log('\nTest 5: Cross-Tradition Exact TM2 Code Lookup');
    // Matched code: SF60
    const resTm2Matched = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/research/by-tm2-code?code=SF60',
      method: 'GET',
      headers: AUTH_HEADERS
    });
    assert(resTm2Matched.status === 200, 'HTTP 200 for TM2 code lookup');
    assert(resTm2Matched.body.matched === true, 'matched is true for SF60');
    assert(resTm2Matched.body.totalMatches === 1, 'Found 1 match for SF60');
    assert(resTm2Matched.body.byTradition.Siddha.length === 1, 'Match categorized under Siddha');
    assert(resTm2Matched.body.byTradition.Siddha[0].code === 'SID-002', 'Matched code is SID-002');

    // Substring false-positive prevention: searching 'SF' must NOT match 'SF60'
    const resTm2Substring = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/research/by-tm2-code?code=SF',
      method: 'GET',
      headers: AUTH_HEADERS
    });
    assert(resTm2Substring.status === 200, 'HTTP 200 for substring check');
    assert(resTm2Substring.body.matched === false, 'Substring "SF" does NOT falsely match "SF60"');
    assert(resTm2Substring.body.totalMatches === 0, '0 matches for substring SF');

    // Valid-but-unmatched code: ZZ99
    const resTm2Unmatched = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/research/by-tm2-code?code=ZZ99',
      method: 'GET',
      headers: AUTH_HEADERS
    });
    assert(resTm2Unmatched.status === 200, 'HTTP 200 for unmatched code');
    assert(resTm2Unmatched.body.matched === false, 'matched is false for ZZ99');
    assert(resTm2Unmatched.body.totalMatches === 0, 'totalMatches is 0');

    // Missing code: returns 400
    const resTm2Missing = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/research/by-tm2-code',
      method: 'GET',
      headers: AUTH_HEADERS
    });
    assert(resTm2Missing.status === 400, 'HTTP 400 Bad Request for missing code parameter');
    assert(resTm2Missing.body.error === 'InvalidTm2Code', 'Error code is InvalidTm2Code');

    // 6. Dataset Export - JSON Format
    console.log('\nTest 6: Dataset Export - JSON Format');
    const resExportJson = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/research/export?format=json&system=all',
      method: 'GET',
      headers: AUTH_HEADERS
    });
    assert(resExportJson.status === 200, 'HTTP 200 for JSON export');
    assert(resExportJson.headers['content-type'].includes('application/json'), 'Content-Type is application/json');
    assert(resExportJson.headers['content-disposition'].includes('attachment; filename='), 'Content-Disposition attachment header present');
    assert(resExportJson.body.metadata !== undefined, 'Export contains standard metadata');
    assert(resExportJson.body.metadata.recordCount === 45, 'Export includes all 45 matching records');
    assert(Array.isArray(resExportJson.body.records), 'Export records is an array');

    // 7. Dataset Export - CSV Format
    console.log('\nTest 7: Dataset Export - CSV Format');
    const resExportCsv = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/research/export?format=csv&system=Ayurveda',
      method: 'GET',
      headers: AUTH_HEADERS
    });
    assert(resExportCsv.status === 200, 'HTTP 200 for CSV export');
    assert(resExportCsv.headers['content-type'].includes('text/csv'), 'Content-Type is text/csv');
    assert(resExportCsv.headers['content-disposition'].includes('.csv'), 'Content-Disposition has .csv extension');
    const csvLines = resExportCsv.rawBody.trim().split('\r\n');
    assert(csvLines[0].startsWith('System,NAMASTE_ID,NAMASTE_Code'), 'CSV header row formatted correctly');
    assert(csvLines.length === 16, `CSV has header + 15 rows for Ayurveda (got ${csvLines.length} lines)`);

    // 8. Formula Injection Mitigation Test
    console.log('\nTest 8: Formula Injection Mitigation Unit Check');
    const { sanitizeForCsv } = require('../controllers/researchController');
    const formulaPayloads = ['=SUM(A1:A10)', '+cmd|/C calc', '-2+3', '@calc'];
    for (const payload of formulaPayloads) {
      const sanitized = sanitizeForCsv(payload);
      assert(sanitized.startsWith("'") || sanitized.startsWith("\"'"), `Formula injection prefix sanitized for '${payload}': got ${sanitized}`);
    }

    // 9. Privacy / Patient & Claims Data Isolation Check
    console.log('\nTest 9: Privacy & Patient/Claims Data Isolation');
    const sampleRecord = resPage1.body.data[0];
    assert(sampleRecord.claimReference === undefined, 'Does not expose claimReference');
    assert(sampleRecord.patientId === undefined, 'Does not expose patientId');
    assert(sampleRecord.notes === undefined, 'Does not expose internal claim notes');
    assert(sampleRecord.system && sampleRecord.code && sampleRecord.term, 'Includes legitimate terminology fields');

    // 10. Regressions Check - Clinician, Admin, Claims, and FHIR
    console.log('\nTest 10: Regression Verification');
    const resClinician = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/terminology/search?q=fever',
      method: 'GET'
    });
    assert(resClinician.status === 200 && Array.isArray(resClinician.body.results), 'Clinician search operational');

    const resClaims = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/claims/resolve?system=Siddha&code=SID-002',
      method: 'GET'
    });
    assert(resClaims.status === 200 && resClaims.body.outcome === 'mapped', 'Claims resolution operational');

    const resAdmin = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/stats',
      method: 'GET',
      headers: { 'Authorization': 'Bearer admin-secret-dev-token-2026' }
    });
    assert(resAdmin.status === 200 && resAdmin.body.stats !== undefined, 'Admin stats operational');

    const resFhir = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/fhir/ConceptMap/$translate?code=SID-002&system=Siddha',
      method: 'GET'
    });
    assert(resFhir.status === 200 && resFhir.body.resourceType === 'Parameters', 'FHIR $translate operational');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`Research Tests Completed: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runResearchTests();
