const http = require('http');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
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

async function runTests() {
  console.log('--- Starting Claims Processor & Review Lifecycle Integration Tests ---');
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
    // 1. Exact Code Resolution - SID-002 (Mapped)
    console.log('\nTest 1: GET /api/claims/resolve?system=Siddha&code=SID-002');
    const resMapped = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/claims/resolve?system=Siddha&code=SID-002',
      method: 'GET'
    });
    assert(resMapped.status === 200, 'HTTP 200 returned for SID-002');
    assert(resMapped.body.outcome === 'mapped', `Outcome is 'mapped' (got: ${resMapped.body.outcome})`);
    assert(resMapped.body.claimResolution !== undefined, 'Contains claimResolution metadata');
    assert(resMapped.body.record && resMapped.body.record.nationalAyushCode === 'SID-002', 'Contains record with code SID-002');
    assert(resMapped.body.statutoryGuidance !== undefined, 'Contains statutory regulatory guidance');

    // 2. Exact Code Resolution - AYU-001 (Unmapped / Flagged)
    console.log('\nTest 2: GET /api/claims/resolve?system=Ayurveda&code=AYU-001');
    const resAyu = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/claims/resolve?system=Ayurveda&code=AYU-001',
      method: 'GET'
    });
    assert(resAyu.status === 200, 'HTTP 200 returned for AYU-001');
    // AYU-001 has TM2 = 'N/A' or flagged, outcome should be flagged or unmapped
    assert(['unmapped', 'flagged'].includes(resAyu.body.outcome), `Outcome is unmapped/flagged (got: ${resAyu.body.outcome})`);
    assert(resAyu.body.record.icd11Tm2Code === 'N/A' || resAyu.body.adminReview.reviewStatus === 'flagged', 'Matches expected mapping state');

    // 3. Exact Code Resolution - Invalid System / Missing params
    console.log('\nTest 3: GET /api/claims/resolve (Invalid Parameters)');
    const resInvalid = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/claims/resolve?system=Homeopathy&code=HOM-001',
      method: 'GET'
    });
    assert(resInvalid.status === 400, 'HTTP 400 for unsupported system');
    assert(resInvalid.body.outcome === 'invalid_code', `Outcome is 'invalid_code' (got: ${resInvalid.body.outcome})`);

    // 4. Exact Code Resolution - Unrecognized Code
    console.log('\nTest 4: GET /api/claims/resolve?system=Ayurveda&code=AYU-NONEXISTENT');
    const resNotFound = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/claims/resolve?system=Ayurveda&code=AYU-NONEXISTENT',
      method: 'GET'
    });
    assert(resNotFound.status === 404, 'HTTP 404 for unrecognized code');
    assert(resNotFound.body.outcome === 'unrecognized_code', `Outcome is 'unrecognized_code' (got: ${resNotFound.body.outcome})`);

    // 5. Claims Ambiguity Search - GET /api/claims/search?q=Pitham&system=Siddha
    console.log('\nTest 5: GET /api/claims/search?q=Pitham&system=Siddha');
    const resSearch = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/claims/search?q=Pitham&system=Siddha&limit=5',
      method: 'GET'
    });
    assert(resSearch.status === 200, 'HTTP 200 for claims ambiguity search');
    assert(Array.isArray(resSearch.body.results), 'Results is an array');
    assert(resSearch.body.results.length > 0, `Found ${resSearch.body.results.length} results matching Pitham`);
    assert(resSearch.body.results[0].resolutionPreview !== undefined, 'Results have resolutionPreview pre-calculated');

    // 6. Create Manual Medical Review Request - POST /api/claims/review-requests
    console.log('\nTest 6: POST /api/claims/review-requests');
    const testClaimRef = 'CLM-AUTO-TEST-' + Date.now();
    const createPayload = {
      claimReference: testClaimRef,
      system: 'Ayurveda',
      code: 'AYU-001',
      recordId: '1',
      reason: 'tm2_mapping_missing',
      notes: 'Automated test suite review submission for unmapped ICD-11 TM2 code.'
    };
    const resCreate = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/claims/review-requests',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, createPayload);
    assert(resCreate.status === 201, `HTTP 201 Created for review request (got ${resCreate.status})`);
    assert(resCreate.body.success === true, 'Success flag true in response');
    assert(resCreate.body.request && resCreate.body.request.id, 'Request ID generated');
    const createdId = resCreate.body.request.id;

    // 7. Duplicate Request Prevention (Deduplication Check)
    console.log('\nTest 7: POST /api/claims/review-requests (Duplicate Submission)');
    const resDuplicate = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/claims/review-requests',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, createPayload);
    assert(resDuplicate.status === 409, `HTTP 409 Conflict returned for duplicate open claim review (got ${resDuplicate.status})`);
    assert(resDuplicate.body.code === 'DUPLICATE_OPEN_REQUEST', 'Error code is DUPLICATE_OPEN_REQUEST');
    assert(resDuplicate.body.existingRequestId === createdId, 'Points to existing request ID');

    // 8. Admin Inspection - GET /api/admin/claims-review-requests
    console.log('\nTest 8: GET /api/admin/claims-review-requests (Auth & Listing)');
    // Without token
    const resNoAuth = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/claims-review-requests',
      method: 'GET'
    });
    assert(resNoAuth.status === 401, 'HTTP 401 Unauthorized without auth header');

    // With token
    const resAdminList = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/claims-review-requests',
      method: 'GET',
      headers: { 'Authorization': 'Bearer admin-secret-dev-token-2026' }
    });
    assert(resAdminList.status === 200, 'HTTP 200 Authorized for admin claims inspection');
    assert(Array.isArray(resAdminList.body.requests), 'Admin returned requests array');
    const foundCreated = resAdminList.body.requests.find(r => r.id === createdId);
    assert(foundCreated !== undefined, 'Created test request found in admin list');
    assert(resAdminList.body.stats !== undefined, 'Summary stats included in admin response');

    // 9. Admin Review Status Update - PATCH /api/admin/claims-review-requests/:id
    console.log(`\nTest 9: PATCH /api/admin/claims-review-requests/${createdId}`);
    const patchPayload = {
      status: 'resolved',
      resolutionNotes: 'Medical examiner verified claim diagnosis against source text. Approved for manual reimbursement under AB-PMJAY guidelines.',
      adjudicatedBy: 'Chief Medical Adjudicator'
    };
    const resPatch = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/admin/claims-review-requests/${createdId}`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer admin-secret-dev-token-2026'
      }
    }, patchPayload);
    assert(resPatch.status === 200, `HTTP 200 returned for patch update (got ${resPatch.status})`);
    assert(resPatch.body.request.status === 'resolved', `Status updated to 'resolved' (got: ${resPatch.body.request.status})`);
    assert(resPatch.body.request.history && resPatch.body.request.history.length > 0, 'Audit history log appended');

    // 10. Regression Check - Clinician Search & FHIR Endpoints
    console.log('\nTest 10: Regression Check - Clinician Search & FHIR Endpoints');
    const resClinician = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/terminology/search?q=fever',
      method: 'GET'
    });
    assert(resClinician.status === 200 && Array.isArray(resClinician.body.results), 'Clinician search /api/terminology/search works');

    const resFHIRCodeSystem = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/fhir/CodeSystem',
      method: 'GET'
    });
    assert(resFHIRCodeSystem.status === 200 && resFHIRCodeSystem.body.resourceType === 'CodeSystem', 'FHIR /CodeSystem works');

    const resTranslate = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/fhir/ConceptMap/$translate?code=SID-002&system=Siddha',
      method: 'GET'
    });
    assert(resTranslate.status === 200 && resTranslate.body.resourceType === 'Parameters', 'FHIR $translate works');

    // 11. Regression Check - Admin Governance Mappings
    console.log('\nTest 11: Regression Check - Admin Governance Endpoint');
    const resAdminGov = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/mappings',
      method: 'GET',
      headers: { 'Authorization': 'Bearer admin-secret-dev-token-2026' }
    });
    assert(resAdminGov.status === 200 && Array.isArray(resAdminGov.body.data), 'Admin /api/admin/mappings works');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`Tests Completed: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
