document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const resultsList = document.getElementById('resultsList');
    const problemListDiv = document.getElementById('problemList');
    const uploadButton = document.getElementById('uploadButton');
    const fhirBundleOutput = document.getElementById('fhirBundleOutput');
    const prevButton = document.getElementById('prevButton');
    const nextButton = document.getElementById('nextButton');
    const pageInfo = document.getElementById('pageInfo');

    let currentTerms = [];
    let problemListItems = [];
    let currentPage = 1;
    let totalPages = 1;
    let searchTimeout;

    async function fetchData(query = '', page = 1) {
      try {
        const res = await fetch(`/api/terminology/search?q=${query}&page=${page}`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        currentTerms = data.results;
        currentPage = data.pagination.currentPage;
        totalPages = data.pagination.totalPages;
        renderResults(currentTerms);
        renderPagination(data.pagination);
      } catch (e) {
        console.error('Error fetching terms:', e);
        resultsList.innerHTML = `<div class="empty-state" style="height: auto; padding: 4rem 0;"><h3>Error Loading Data</h3><p>Could not connect to the server. Please ensure it's running.</p></div>`;
      }
    }

    function renderPagination(pagination) {
        pageInfo.textContent = `Page ${pagination.currentPage} of ${pagination.totalPages} (${pagination.totalResults} results)`;
        prevButton.disabled = pagination.currentPage <= 1;
        nextButton.disabled = pagination.currentPage >= pagination.totalPages;
    }

    function renderResults(filteredTerms) {
        resultsList.innerHTML = '';
        const addedCodes = problemListItems.map(item => item.code.coding.find(c => c.system.includes('namaste')).code);

        if (filteredTerms.length === 0) {
            resultsList.innerHTML = `<div class="empty-state" style="height: auto; padding: 4rem 0;">
                <svg class="empty-state-icon" style="width: 50px; height: 50px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <h3>No Results Found</h3>
                <p>${searchInput.value ? 'Try adjusting your search query.' : 'Try searching for a term to begin.'}</p>
            </div>`;
            return;
        }

        filteredTerms.forEach(item => {
            const li = document.createElement('li');
            li.className = 'result-card';
            const isAdded = addedCodes.includes(item.code);
            if (isAdded) {
                li.classList.add('already-added');
            }

            const primaryDisplay = (item.icd11_biomed_display && item.icd11_biomed_display !== 'Not Mapped')
                                       ? item.icd11_biomed_display
                                       : (item.definition || item.term);

            const subtextDisplay = (primaryDisplay !== item.term)
                                       ? `<div class="term-secondary">${item.term}</div>`
                                       : '';

            li.innerHTML = `
                <div class="term-details">
                    <div class="term-primary">${primaryDisplay} (${item.system})</div>
                    ${subtextDisplay}
                    <div class="term-codes">
                        <span>NAMASTE: ${item.code}</span>
                        <span>TM2: ${item.icd11_tm2_code} (${item.icd11_tm2_display})</span>
                        <span>Biomed: ${item.icd11_biomed_code} (${item.icd11_biomed_display})</span>
                    </div>
                </div>
                <button data-code="${item.code}" class="btn btn-primary" ${isAdded ? 'disabled' : ''}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2Z"/></svg>
                    <span>${isAdded ? 'Added' : 'Add'}</span>
                </button>
            `;
            resultsList.appendChild(li);
        });
    }
    
    function handleSearchInput() {
        fetchData(searchInput.value.trim(), 1);
    }

    function createFhirCondition(item) {
        return {
            resourceType: "Condition",
            id: `cond-${item.id}`,
            meta: { versionId: "1", lastUpdated: new Date().toISOString(), extension: [{ url: "http://example.org/fhir/StructureDefinition/consent-id", valueString: "consent-12345" }] },
            clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
            verificationStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "confirmed" }] },
            code: {
                text: item.term,
                coding: [
                    { system: "http://namaste.gov.in/CodeSystem/namaste-terms", code: item.code, display: item.term },
                    { system: "http://id.who.int/icd/entity", code: item.icd11_biomed_code, display: item.icd11_biomed_display },
                    { system: "http://id.who.int/icd/entity/tm", code: item.icd11_tm2_code, display: item.icd11_tm2_display }
                ]
            },
            subject: { reference: "Patient/patient-123" }
        };
    }
    function addToProblemList(item) {
        const conditionResource = createFhirCondition(item);
        problemListItems.push(conditionResource);
        renderProblemList();
        renderResults(currentTerms);
    }
    
    // Make this function global so it can be called from the inline onclick
    window.removeFromProblemList = function(conditionId) {
        problemListItems = problemListItems.filter(item => item.id !== conditionId);
        renderProblemList();
        renderResults(currentTerms);
    }

    function renderProblemList() {
        if (problemListItems.length === 0) {
            problemListDiv.innerHTML = `<div class="empty-state">
                <svg class="empty-state-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                <h3>Problem List is Empty</h3>
                <p>Add terms from the search results to see them here.</p>
            </div>`;
            return;
        }
        problemListDiv.innerHTML = '';
        problemListItems.forEach(condition => {
            const div = document.createElement('div');
            div.className = 'problem-item';
            const namasteCoding = condition.code.coding.find(c => c.system.includes('namaste'));
            const biomedCoding = condition.code.coding.find(c => c.system === 'http://id.who.int/icd/entity');
            const primaryDisplay = (biomedCoding && biomedCoding.display !== 'Not Mapped') ? biomedCoding.display : namasteCoding.display;
            
            div.innerHTML = `
                <span class="problem-item-text">${primaryDisplay} [${namasteCoding.code}]</span>
                <button class="btn-remove" onclick="removeFromProblemList('${condition.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
                </button>
            `;
            problemListDiv.appendChild(div);
        });
    }
    async function uploadEncounter() {
        if (problemListItems.length === 0) {
            alert('Problem list is empty. Add at least one diagnosis.');
            return;
        }
        const bundleId = `bundle-${Date.now()}`;
        const patientId = "patient-123";
        const practitionerId = "practitioner-456";
        const encounterId = `enc-${Date.now()}`;
        const fhirBundle = {
            resourceType: 'Bundle', id: bundleId, type: 'transaction', timestamp: new Date().toISOString(), entry: []
        };
        fhirBundle.entry.push({
            fullUrl: `Patient/${patientId}`,
            resource: { resourceType: "Patient", id: patientId, name: [{ text: "Ramesh Kumar" }] },
            request: { method: "PUT", url: `Patient/${patientId}` }
        });
        fhirBundle.entry.push({
            fullUrl: `Encounter/${encounterId}`,
            resource: {
                resourceType: "Encounter", id: encounterId, status: "finished",
                class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB" },
                subject: { reference: `Patient/${patientId}` },
                participant: [{ individual: { reference: `Practitioner/${practitionerId}` } }]
            },
            request: { method: "POST", url: "Encounter" }
        });
        problemListItems.forEach(condition => {
            fhirBundle.entry.push({
                fullUrl: `Condition/${condition.id}`, resource: condition, request: { method: "POST", url: "Condition" }
            });
        });
        fhirBundleOutput.textContent = JSON.stringify(fhirBundle, null, 2);
        try {
            const response = await fetch('/api/fhir/Bundle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer mock-abha-token-12345' },
                body: JSON.stringify(fhirBundle)
            });
            const result = await response.json();
            if (response.ok) {
                alert(`Upload successful! Audit ID: ${result.auditId}`);
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (e) {
            console.error('Upload failed:', e);
            alert(`Upload failed: ${e.message}`);
        }
    }

    // --- Event Listeners ---
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(handleSearchInput, 300);
    });
    
    resultsList.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-code]');
        if (button) {
            const code = button.dataset.code;
            const item = currentTerms.find(t => t.code === code);
            if (item) {
                addToProblemList(item);
            }
        }
    });

    uploadButton.addEventListener('click', uploadEncounter);

    prevButton.addEventListener('click', () => {
        if (currentPage > 1) {
            fetchData(searchInput.value.trim(), currentPage - 1);
        }
    });

    nextButton.addEventListener('click', () => {
        if (currentPage < totalPages) {
            fetchData(searchInput.value.trim(), currentPage + 1);
        }
    });

    // Initial data load
    fetchData();
    renderProblemList();
});