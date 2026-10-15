const http = require('http');

const BASE_URL = 'http://localhost:3000';
const ADMIN_TOKEN = 'admin-secret-dev-token-2026';

async function request(path, options = {}) {
  const url = new URL(path, BASE_URL);
  const headers = options.headers || {};
  const method = options.method || 'GET';
  const body = options.body ? JSON.stringify(options.body) : null;

  if (body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING COMPREHENSIVE END-TO-END TESTS ---\n');
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

  try {
    // 1. Basic search with pagination and enrichment
    const resSearch = await request('/api/terminology/search?q=jwara&limit=10');
    assert(resSearch.status === 200, 'Search endpoint returns 200 OK');
    assert(resSearch.data.results && resSearch.data.results.length > 0, 'Search returns results for "jwara"');
    const firstItem = resSearch.data.results[0];
    assert(firstItem.composite_key === 'ayurveda-4', `Composite key generated: ${firstItem.composite_key}`);
    assert(firstItem.review_status, `Review status present: ${firstItem.review_status}`);

    // 2. Tradition filtering
    const resAyurveda = await request('/api/terminology/search?system=Ayurveda&limit=50');
    const allAyurveda = resAyurveda.data.results.every(r => r.system === 'Ayurveda');
    assert(allAyurveda && resAyurveda.data.results.length === 15, `Ayurveda filter returned all 15 records`);

    const resSiddha = await request('/api/terminology/search?system=Siddha&limit=50');
    const allSiddha = resSiddha.data.results.every(r => r.system === 'Siddha');
    assert(allSiddha && resSiddha.data.results.length === 15, `Siddha filter returned all 15 records`);

    const resUnani = await request('/api/terminology/search?system=Unani&limit=50');
    const allUnani = resUnani.data.results.every(r => r.system === 'Unani');
    assert(allUnani && resUnani.data.results.length === 15, `Unani filter returned all 15 records`);

    // 3. Status filtering
    const resUnmapped = await request('/api/terminology/search?status=unmapped&limit=50');
    assert(resUnmapped.status === 200, 'Status filtering for unmapped records returns 200');
    assert(resUnmapped.data.results.every(r => r.review_status === 'unmapped'), 'All returned records have status "unmapped"');

    // 4. Admin Auth verification
    const resUnauth = await request('/api/admin/stats');
    assert(resUnauth.status === 401, 'Unauthenticated request to /api/admin/stats rejected with 401');

    const resForbidden = await request('/api/admin/stats', {
      headers: { 'Authorization': 'Bearer wrong-invalid-token' }
    });
    assert(resForbidden.status === 403, 'Invalid token to /api/admin/stats rejected with 403');

    const resAdminStats = await request('/api/admin/stats', {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    assert(resAdminStats.status === 200, 'Authenticated request to /api/admin/stats returns 200');
    assert(resAdminStats.data.stats.totalRecords === 45, 'Admin stats reports 45 total records');

    // 5. Admin Mapping details (GET /api/admin/mappings/:system/:id)
    const resDetails = await request('/api/admin/mappings/Siddha/2', {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    assert(resDetails.status === 200, 'GET /api/admin/mappings/Siddha/2 returns 200');
    assert(resDetails.data.compositeKey === 'siddha-2', `Composite key is siddha-2`);
    assert(resDetails.data.mappingDetails.hasBiomedMapping === true, 'Siddha-2 has biomed mapping');
    assert(resDetails.data.mappingDetails.currentFingerprint, 'Current fingerprint generated');

    // 6. Verification validation: Reject unmapped record verification
    const resVerifyUnmapped = await request('/api/admin/mappings/Ayurveda/1/verify', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
      body: { notes: 'Attempting to verify unmapped' }
    });
    assert(resVerifyUnmapped.status === 400, 'Verifying unmapped record properly rejected with 400 Bad Request');

    // 7. Verification: Verify mapped record (Siddha/2)
    const resVerify = await request('/api/admin/mappings/Siddha/2/verify', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
      body: { notes: 'Approved clinical mapping for Pitham', reviewer: 'chief_admin' }
    });
    assert(resVerify.status === 200, 'Verifying mapped record Siddha/2 returns 200');
    assert(resVerify.data.reviewStatus === 'verified', 'Review status updated to "verified"');

    // 8. Flagging: Flag an unmapped or incorrect record (Ayurveda/1)
    const resFlag = await request('/api/admin/mappings/Ayurveda/1/flag', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
      body: {
        reasonCategory: 'missing_icd11_tm2_mapping',
        description: 'Amavata corresponds to inflammatory arthritis; needs dual coding TM2 and Biomed',
        suggestion: 'ICD-11 TM2 code SF60',
        reviewer: 'ayurveda_expert'
      }
    });
    assert(resFlag.status === 200, 'Flagging record Ayurveda/1 returns 200');
    assert(resFlag.data.reviewStatus === 'flagged', 'Review status updated to "flagged"');

    // 9. History retrieval (GET /api/admin/mappings/:system/:id/history)
    const resHistory = await request('/api/admin/mappings/Ayurveda/1/history', {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    assert(resHistory.status === 200, 'GET history returns 200');
    assert(resHistory.data.history.length >= 1, 'History contains at least 1 audit entry');
    assert(resHistory.data.history[0].action === 'FLAGGED', 'Most recent action is FLAGGED');

    // 10. Status filter for verified
    const resVerifiedList = await request('/api/terminology/search?status=verified');
    assert(resVerifiedList.data.results.some(r => r.composite_key === 'siddha-2'), 'Siddha-2 appears in verified search');

    // 11. Existing clinician endpoints check
    const resCodeSystem = await request('/api/terminology/CodeSystem');
    assert(resCodeSystem.status === 200 && resCodeSystem.data.resourceType === 'CodeSystem', 'CodeSystem endpoint functional');

    const resConceptMap = await request('/api/terminology/ConceptMap');
    assert(resConceptMap.status === 200 && resConceptMap.data.resourceType === 'ConceptMap', 'ConceptMap endpoint functional');

    const resTranslate = await request('/api/terminology/ConceptMap/$translate?system=http://namaste.gov.in/CodeSystem/namaste-terms/siddha&code=A');
    assert(resTranslate.status === 200, 'FHIR $translate endpoint functional');

    // 12. FHIR Bundle upload with mock token
    const sampleBundle = {
      resourceType: 'Bundle',
      id: 'test-bundle-1',
      type: 'transaction',
      entry: [{
        fullUrl: 'Patient/test-1',
        resource: { resourceType: 'Patient', id: 'test-1' },
        request: { method: 'PUT', url: 'Patient/test-1' }
      }]
    };
    const resBundle = await request('/api/fhir/Bundle', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer mock-abha-token-12345' },
      body: sampleBundle
    });
    assert(resBundle.status === 200 && resBundle.data.status === 'success', 'FHIR Bundle upload endpoint functional');

    console.log(`\n--- TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ---`);
  } catch (error) {
    console.error('Test execution error:', error);
  }
}

runTests();
