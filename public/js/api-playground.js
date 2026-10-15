document.addEventListener('DOMContentLoaded', () => {
    // --- Helper to display results ---
    function displayResult(elementId, content, isJson = true) {
        const element = document.getElementById(elementId);
        if (!element) return;

        let finalContent = content;
        if (isJson) {
            finalContent = JSON.stringify(content, null, 2);
        }
        
        if (element.tagName === 'CODE' || element.tagName === 'PRE') {
            element.textContent = finalContent;
        } else {
            element.innerHTML = finalContent;
        }
    }

    // --- Search Endpoint Logic ---
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', async () => {
            const query = document.getElementById('searchQuery').value.trim();
            const system = (document.getElementById('searchSystem') || {}).value || '';
            const status = (document.getElementById('searchStatus') || {}).value || '';
            const page = document.getElementById('searchPage').value.trim();

            const url = new URL(`${window.location.origin}/api/terminology/search`);
            if (query) url.searchParams.append('q', query);
            if (system && system !== 'all') url.searchParams.append('system', system);
            if (status && status !== 'all') url.searchParams.append('status', status);
            if (page) url.searchParams.append('page', page);

            displayResult('searchCurl', `curl -X GET "${url}"`, false);
            displayResult('searchResponse', { message: "Loading..." });

            try {
                const res = await fetch(url);
                const data = await res.json();
                displayResult('searchResponse', data);
            } catch (e) {
                displayResult('searchResponse', { error: e.message });
            }
        });
    }

    // --- Translate Endpoint Logic ---
    const translateBtn = document.getElementById('translateBtn');
    if (translateBtn) {
        translateBtn.addEventListener('click', async () => {
            const system = document.getElementById('translateSystem').value;
            const code = document.getElementById('translateCode').value;
            const url = new URL(`${window.location.origin}/api/terminology/ConceptMap/$translate`);
            if (system) url.searchParams.append('system', system);
            if (code) url.searchParams.append('code', code);
            
            displayResult('translateCurl', `curl -X GET "${url}"`, false);
            displayResult('translateResponse', { message: "Loading..." });

            try {
                const res = await fetch(url);
                const data = await res.json();
                displayResult('translateResponse', data);
            } catch (e) {
                displayResult('translateResponse', { error: e.message });
            }
        });
    }
    
    // --- Bundle Endpoint Logic ---
    const bundleBtn = document.getElementById('bundleBtn');
    if (bundleBtn) {
        const bundleBody = document.getElementById('bundleBody');
        bundleBody.value = JSON.stringify({
            resourceType: "Bundle",
            id: "bundle-example-1",
            type: "transaction",
            entry: [{
                fullUrl: "Patient/example",
                resource: { resourceType: "Patient", id: "example" },
                request: { method: "PUT", url: "Patient/example" }
            }]
        }, null, 2);
        
        bundleBtn.addEventListener('click', async () => {
            const token = document.getElementById('bundleToken').value;
            const body = bundleBody.value;
            const url = `${window.location.origin}/api/fhir/Bundle`;

            const curlCommand = `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: ${token}" \\\n  -d '${body}'`;
            displayResult('bundleCurl', curlCommand, false);
            displayResult('bundleResponse', { message: "Loading..." });
            
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token
                    },
                    body: body
                });
                const data = await res.json();
                displayResult('bundleResponse', data);
            } catch (e) {
                displayResult('bundleResponse', { error: e.message });
            }
        });
    }

    // --- Admin Details Endpoint Logic ---
    const adminDetailsBtn = document.getElementById('adminDetailsBtn');
    if (adminDetailsBtn) {
        adminDetailsBtn.addEventListener('click', async () => {
            const token = document.getElementById('adminDetailsToken').value.trim();
            const system = document.getElementById('adminDetailsSystem').value.trim();
            const id = document.getElementById('adminDetailsId').value.trim();
            const url = `${window.location.origin}/api/admin/mappings/${encodeURIComponent(system)}/${encodeURIComponent(id)}`;

            const curlCommand = `curl -X GET "${url}" \\\n  -H "Authorization: ${token}"`;
            displayResult('adminDetailsCurl', curlCommand, false);
            displayResult('adminDetailsResponse', { message: "Loading..." });

            try {
                const res = await fetch(url, {
                    headers: { 'Authorization': token }
                });
                const data = await res.json();
                displayResult('adminDetailsResponse', data);
            } catch (e) {
                displayResult('adminDetailsResponse', { error: e.message });
            }
        });
    }

    // --- Admin Verify Endpoint Logic ---
    const adminVerifyBtn = document.getElementById('adminVerifyBtn');
    if (adminVerifyBtn) {
        adminVerifyBtn.addEventListener('click', async () => {
            const token = document.getElementById('adminVerifyToken').value.trim();
            const system = document.getElementById('adminVerifySystem').value.trim();
            const id = document.getElementById('adminVerifyId').value.trim();
            const notes = document.getElementById('adminVerifyNotes').value.trim();
            const url = `${window.location.origin}/api/admin/mappings/${encodeURIComponent(system)}/${encodeURIComponent(id)}/verify`;

            const payload = { notes, reviewer: "admin" };
            const curlCommand = `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: ${token}" \\\n  -d '${JSON.stringify(payload)}'`;
            displayResult('adminVerifyCurl', curlCommand, false);
            displayResult('adminVerifyResponse', { message: "Loading..." });

            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token
                    },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                displayResult('adminVerifyResponse', data);
            } catch (e) {
                displayResult('adminVerifyResponse', { error: e.message });
            }
        });
    }

    // --- Admin Flag Endpoint Logic ---
    const adminFlagBtn = document.getElementById('adminFlagBtn');
    if (adminFlagBtn) {
        adminFlagBtn.addEventListener('click', async () => {
            const token = document.getElementById('adminFlagToken').value.trim();
            const system = document.getElementById('adminFlagSystem').value.trim();
            const id = document.getElementById('adminFlagId').value.trim();
            const reasonCategory = document.getElementById('adminFlagCategory').value;
            const description = document.getElementById('adminFlagDescription').value.trim();
            const suggestion = document.getElementById('adminFlagSuggestion').value.trim();
            const url = `${window.location.origin}/api/admin/mappings/${encodeURIComponent(system)}/${encodeURIComponent(id)}/flag`;

            const payload = { reasonCategory, description, suggestion, reviewer: "admin" };
            const curlCommand = `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: ${token}" \\\n  -d '${JSON.stringify(payload)}'`;
            displayResult('adminFlagCurl', curlCommand, false);
            displayResult('adminFlagResponse', { message: "Loading..." });

            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token
                    },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                displayResult('adminFlagResponse', data);
            } catch (e) {
                displayResult('adminFlagResponse', { error: e.message });
            }
        });
    }

    // --- Admin History Endpoint Logic ---
    const adminHistoryBtn = document.getElementById('adminHistoryBtn');
    if (adminHistoryBtn) {
        adminHistoryBtn.addEventListener('click', async () => {
            const token = document.getElementById('adminHistoryToken').value.trim();
            const system = document.getElementById('adminHistorySystem').value.trim();
            const id = document.getElementById('adminHistoryId').value.trim();
            const url = `${window.location.origin}/api/admin/mappings/${encodeURIComponent(system)}/${encodeURIComponent(id)}/history`;

            const curlCommand = `curl -X GET "${url}" \\\n  -H "Authorization: ${token}"`;
            displayResult('adminHistoryCurl', curlCommand, false);
            displayResult('adminHistoryResponse', { message: "Loading..." });

            try {
                const res = await fetch(url, {
                    headers: { 'Authorization': token }
                });
                const data = await res.json();
                displayResult('adminHistoryResponse', data);
            } catch (e) {
                displayResult('adminHistoryResponse', { error: e.message });
            }
        });
    }

    // --- Claims Resolve Endpoint Logic ---
    const claimsResolveBtn = document.getElementById('claimsResolveBtn');
    if (claimsResolveBtn) {
        claimsResolveBtn.addEventListener('click', async () => {
            const system = document.getElementById('claimsResolveSystem').value.trim();
            const code = document.getElementById('claimsResolveCode').value.trim();
            const url = `${window.location.origin}/api/claims/resolve?system=${encodeURIComponent(system)}&code=${encodeURIComponent(code)}`;

            const curlCommand = `curl -X GET "${url}"`;
            displayResult('claimsResolveCurl', curlCommand, false);
            displayResult('claimsResolveResponse', { message: "Loading..." });

            try {
                const res = await fetch(url);
                const data = await res.json();
                displayResult('claimsResolveResponse', data);
            } catch (e) {
                displayResult('claimsResolveResponse', { error: e.message });
            }
        });
    }

    // --- Claims Review Request Endpoint Logic ---
    const claimsSubmitReqBtn = document.getElementById('claimsSubmitReqBtn');
    if (claimsSubmitReqBtn) {
        claimsSubmitReqBtn.addEventListener('click', async () => {
            const claimReference = document.getElementById('claimsReqRef').value.trim();
            const system = document.getElementById('claimsReqSystem').value.trim();
            const recordId = document.getElementById('claimsReqRecordId').value.trim();
            const code = document.getElementById('claimsReqCode').value.trim();
            const reason = document.getElementById('claimsReqReason').value;
            const notes = document.getElementById('claimsReqNotes').value.trim();
            const url = `${window.location.origin}/api/claims/review-requests`;

            const payload = { claimReference, system, recordId, code, reason, notes, requestedBy: "claims_processor" };
            const curlCommand = `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(payload)}'`;
            displayResult('claimsSubmitReqCurl', curlCommand, false);
            displayResult('claimsSubmitReqResponse', { message: "Loading..." });

            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                displayResult('claimsSubmitReqResponse', data);
            } catch (e) {
                displayResult('claimsSubmitReqResponse', { error: e.message });
            }
        });
    }

    // --- Admin Claims List Endpoint Logic ---
    const adminClaimsListBtn = document.getElementById('adminClaimsListBtn');
    if (adminClaimsListBtn) {
        adminClaimsListBtn.addEventListener('click', async () => {
            const token = document.getElementById('adminClaimsToken').value.trim();
            const url = `${window.location.origin}/api/admin/claims-review-requests`;

            const curlCommand = `curl -X GET "${url}" \\\n  -H "Authorization: ${token}"`;
            displayResult('adminClaimsListCurl', curlCommand, false);
            displayResult('adminClaimsListResponse', { message: "Loading..." });

            try {
                const res = await fetch(url, {
                    headers: { 'Authorization': token }
                });
                const data = await res.json();
                displayResult('adminClaimsListResponse', data);
            } catch (e) {
                displayResult('adminClaimsListResponse', { error: e.message });
            }
        });
    }
});
