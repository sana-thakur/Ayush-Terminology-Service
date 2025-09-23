document.addEventListener('DOMContentLoaded', () => {
    // --- Helper to display results ---
    function displayResult(elementId, content, isJson = true) {
        const element = document.getElementById(elementId);
        if(!element) return;

        let finalContent = content;
        if (isJson) {
            finalContent = JSON.stringify(content, null, 2);
        }
        
        // Check if the target is a `code` element within a `pre`
        if (element.tagName === 'CODE' || element.tagName === 'PRE') {
            element.textContent = finalContent;
        } else {
             // Fallback for other elements if needed
            element.innerHTML = finalContent;
        }
    }

    // --- Search Endpoint Logic ---
    const searchBtn = document.getElementById('searchBtn');
    if(searchBtn) {
        searchBtn.addEventListener('click', async () => {
            const query = document.getElementById('searchQuery').value;
            const page = document.getElementById('searchPage').value;
            const url = new URL(`${window.location.origin}/api/terminology/search`);
            if(query) url.searchParams.append('q', query);
            if(page) url.searchParams.append('page', page);

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
    if(translateBtn) {
        translateBtn.addEventListener('click', async () => {
            const system = document.getElementById('translateSystem').value;
            const code = document.getElementById('translateCode').value;
            const url = new URL(`${window.location.origin}/api/terminology/ConceptMap/$translate`);
            if(system) url.searchParams.append('system', system);
            if(code) url.searchParams.append('code', code);
            
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
    if(bundleBtn) {
        const bundleBody = document.getElementById('bundleBody');
        // Pre-populate with an example
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
});
