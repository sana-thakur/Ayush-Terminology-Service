document.addEventListener('DOMContentLoaded', () => {
  // --- Auth State ---
  const DEFAULT_DEV_TOKEN = 'researcher-secret-dev-token-2026';
  let researcherToken = localStorage.getItem('ayush_researcher_token') || DEFAULT_DEV_TOKEN;

  // --- Cohort State ---
  let currentPage = 1;
  let totalPages = 1;
  let totalMatching = 0;
  let currentRecords = [];

  // --- DOM Elements ---
  const researcherAuthStatus = document.getElementById('researcherAuthStatus');
  const openAuthModalBtn = document.getElementById('openAuthModalBtn');
  const authModal = document.getElementById('authModal');
  const closeAuthModalBtn = document.getElementById('closeAuthModalBtn');
  const researcherTokenInput = document.getElementById('researcherTokenInput');
  const saveAuthTokenBtn = document.getElementById('saveAuthTokenBtn');
  const resetAuthTokenBtn = document.getElementById('resetAuthTokenBtn');

  // Tabs
  const tabTm2Btn = document.getElementById('tabTm2Btn');
  const tabCohortBtn = document.getElementById('tabCohortBtn');
  const tm2Section = document.getElementById('tm2Section');
  const cohortSection = document.getElementById('cohortSection');

  // TM2 Crosswalk
  const tm2LookupForm = document.getElementById('tm2LookupForm');
  const tm2CodeInput = document.getElementById('tm2CodeInput');
  const tm2SystemSelect = document.getElementById('tm2SystemSelect');
  const tm2SubmitBtn = document.getElementById('tm2SubmitBtn');
  const tm2ResultsArea = document.getElementById('tm2ResultsArea');

  // Cohort Filters
  const cohortSystem = document.getElementById('cohortSystem');
  const cohortQuery = document.getElementById('cohortQuery');
  const cohortTm2Code = document.getElementById('cohortTm2Code');
  const cohortBiomedCode = document.getElementById('cohortBiomedCode');
  const cohortMappingStatus = document.getElementById('cohortMappingStatus');
  const cohortVerificationStatus = document.getElementById('cohortVerificationStatus');
  const cohortLimit = document.getElementById('cohortLimit');
  const applyCohortBtn = document.getElementById('applyCohortBtn');
  const resetCohortBtn = document.getElementById('resetCohortBtn');
  const cohortMatchingBadge = document.getElementById('cohortMatchingBadge');

  // Cohort Table
  const cohortTableBody = document.getElementById('cohortTableBody');
  const cohortPaginationInfo = document.getElementById('cohortPaginationInfo');
  const cohortPrevBtn = document.getElementById('cohortPrevBtn');
  const cohortNextBtn = document.getElementById('cohortNextBtn');

  // Exports
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const exportCsvLabel = document.getElementById('exportCsvLabel');
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  const exportJsonLabel = document.getElementById('exportJsonLabel');

  // Definition Modal
  const defModal = document.getElementById('defModal');
  const defModalTitle = document.getElementById('defModalTitle');
  const closeDefModalBtn = document.getElementById('closeDefModalBtn');
  const closeDefModalFooterBtn = document.getElementById('closeDefModalFooterBtn');
  const defModalSystemBadge = document.getElementById('defModalSystemBadge');
  const defModalCodeBadge = document.getElementById('defModalCodeBadge');
  const defModalText = document.getElementById('defModalText');
  const defModalTm2 = document.getElementById('defModalTm2');
  const defModalBiomed = document.getElementById('defModalBiomed');

  // Toast
  const toastContainer = document.getElementById('toastContainer');

  // --- Auth UI Helper ---
  function updateAuthUI() {
    if (researcherToken) {
      researcherAuthStatus.textContent = `Active (Token: ${researcherToken.substring(0, 16)}...)`;
      researcherTokenInput.value = researcherToken;
    } else {
      researcherAuthStatus.textContent = 'Unauthenticated';
      researcherTokenInput.value = '';
    }
  }

  function getAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${researcherToken}`
    };
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Tab Navigation ---
  tabTm2Btn.addEventListener('click', () => {
    tabTm2Btn.classList.add('active');
    tabCohortBtn.classList.remove('active');
    tm2Section.style.display = 'block';
    cohortSection.style.display = 'none';
  });

  tabCohortBtn.addEventListener('click', () => {
    tabCohortBtn.classList.add('active');
    tabTm2Btn.classList.remove('active');
    tm2Section.style.display = 'none';
    cohortSection.style.display = 'block';
    if (currentRecords.length === 0) {
      fetchCohortRecords();
    }
  });

  // --- TM2 Exact Crosswalk Lookup ---
  tm2LookupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = tm2CodeInput.value.trim();
    const system = tm2SystemSelect.value;

    if (!code) {
      showToast('Please enter an ICD-11 TM2 code.', 'error');
      return;
    }

    tm2SubmitBtn.disabled = true;
    tm2SubmitBtn.innerHTML = '<span class="spinner-sm"></span> Searching...';

    try {
      const url = `/api/research/by-tm2-code?code=${encodeURIComponent(code)}&system=${encodeURIComponent(system)}`;
      const response = await fetch(url, { headers: getAuthHeaders() });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || `Server returned ${response.status}`);
      }

      const data = await response.json();
      renderTm2CrosswalkResults(data);
    } catch (err) {
      console.error('TM2 lookup error:', err);
      showToast(err.message, 'error');
      tm2ResultsArea.innerHTML = `
        <div class="empty-state" style="border-color: #fee2e2; background: #fff5f5;">
          <p style="color: #c62828; font-weight: 600;">Error: ${escapeHtml(err.message)}</p>
        </div>
      `;
    } finally {
      tm2SubmitBtn.disabled = false;
      tm2SubmitBtn.textContent = 'Lookup TM2 Crosswalk';
    }
  });

  function renderTm2CrosswalkResults(data) {
    const { searchedCode, matched, totalMatches, byTradition, message } = data;

    if (!matched || totalMatches === 0) {
      tm2ResultsArea.innerHTML = `
        <div class="panel" style="border-left: 4px solid #f59e0b; margin-top: 1.25rem;">
          <h3 style="margin-top: 0; color: #b45309; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>ℹ️</span> No Mapped Diagnoses Found
          </h3>
          <p style="color: var(--text-color); margin-bottom: 0.5rem;">
            ICD-11 TM2 code <code>${escapeHtml(searchedCode)}</code> is recognized as a valid query, but no traditional medicine diagnoses in NAMASTE currently crosswalk to this entity.
          </p>
          <small style="color: var(--text-light);">${escapeHtml(message || '')}</small>
        </div>
      `;
      return;
    }

    const ayuCount = (byTradition.Ayurveda || []).length;
    const sidCount = (byTradition.Siddha || []).length;
    const unaCount = (byTradition.Unani || []).length;

    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <span style="font-weight: 700; font-size: 1.1rem; color: var(--text-color);">
            Crosswalk Mapping for ICD-11 TM2: <code>${escapeHtml(searchedCode)}</code>
          </span>
          <span class="badge badge-verified" style="margin-left: 0.5rem;">${totalMatches} ${totalMatches === 1 ? 'Concept' : 'Concepts'} Linked</span>
        </div>
        <small style="color: var(--text-light);">Cross-tradition synchronization across all 3 AYUSH medical systems</small>
      </div>

      <div class="crosswalk-results-grid">
        <!-- Ayurveda Column -->
        <div class="tradition-column-card">
          <div class="tradition-column-header ayurveda">
            <span>🌿 Ayurveda</span>
            <span class="badge" style="background: rgba(133, 77, 14, 0.15); color: #854d0e;">${ayuCount}</span>
          </div>
          <div class="tradition-item-list">
            ${renderTraditionItemList(byTradition.Ayurveda || [])}
          </div>
        </div>

        <!-- Siddha Column -->
        <div class="tradition-column-card">
          <div class="tradition-column-header siddha">
            <span>🌱 Siddha</span>
            <span class="badge" style="background: rgba(91, 33, 182, 0.15); color: #5b21b6;">${sidCount}</span>
          </div>
          <div class="tradition-item-list">
            ${renderTraditionItemList(byTradition.Siddha || [])}
          </div>
        </div>

        <!-- Unani Column -->
        <div class="tradition-column-card">
          <div class="tradition-column-header unani">
            <span>🍃 Unani</span>
            <span class="badge" style="background: rgba(6, 95, 70, 0.15); color: #065f46;">${unaCount}</span>
          </div>
          <div class="tradition-item-list">
            ${renderTraditionItemList(byTradition.Unani || [])}
          </div>
        </div>
      </div>
    `;

    tm2ResultsArea.innerHTML = html;

    // Attach click events on crosswalk item cards for full definition modal
    tm2ResultsArea.querySelectorAll('.crosswalk-item-card').forEach(card => {
      card.addEventListener('click', () => {
        const itemData = JSON.parse(card.dataset.record);
        openDefinitionModal(itemData);
      });
    });
  }

  function renderTraditionItemList(items) {
    if (items.length === 0) {
      return `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-light); font-size: 0.85rem;">
          No diagnoses linked in this tradition.
        </div>
      `;
    }

    return items.map(item => `
      <div class="crosswalk-item-card" data-record="${escapeHtml(JSON.stringify(item))}" style="cursor: pointer;">
        <div class="crosswalk-item-header">
          <span class="crosswalk-item-code">${escapeHtml(item.code)}</span>
          <span class="pill-sm ${item.verificationStatus === 'verified' ? 'verified' : (item.verificationStatus === 'flagged' ? 'flagged' : 'unmapped')}">
            ${escapeHtml(item.verificationStatus)}
          </span>
        </div>
        <div class="crosswalk-item-term">${escapeHtml(item.term)}</div>
        <div class="crosswalk-item-def">${escapeHtml(item.definition ? item.definition.substring(0, 120) + (item.definition.length > 120 ? '...' : '') : '')}</div>
        <div class="crosswalk-meta-pills">
          <span class="pill-sm" style="background: #e0f2fe; color: #0369a1;">
            Biomed: ${escapeHtml(item.icd11Biomedical && item.icd11Biomedical.code !== 'N/A' ? item.icd11Biomedical.code : 'Not Mapped')}
          </span>
        </div>
      </div>
    `).join('');
  }

  // --- General Cohort Discovery & Filter ---
  function getActiveFilters() {
    return {
      system: cohortSystem.value,
      q: cohortQuery.value.trim(),
      tm2Code: cohortTm2Code.value.trim(),
      biomedicalCode: cohortBiomedCode.value.trim(),
      mappingStatus: cohortMappingStatus.value,
      verificationStatus: cohortVerificationStatus.value,
      limit: parseInt(cohortLimit.value, 10) || 25,
      page: currentPage
    };
  }

  async function fetchCohortRecords() {
    cohortTableBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 3rem;">
          <div class="empty-state" style="height: auto;">
            <p>Loading research records...</p>
          </div>
        </td>
      </tr>
    `;

    try {
      const filters = getActiveFilters();
      const params = new URLSearchParams(filters);

      const response = await fetch(`/api/research/records?${params.toString()}`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const resData = await response.json();
      currentRecords = resData.data || [];
      const meta = resData.metadata || {};

      totalMatching = meta.matchingCount || 0;
      totalPages = meta.totalPages || 1;
      currentPage = meta.currentPage || 1;

      renderCohortTable();
      updateCohortPagination();
    } catch (err) {
      console.error('Cohort records error:', err);
      showToast(err.message, 'error');
      cohortTableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 2.5rem; color: #c62828;">
            Failed to load records: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }

  function renderCohortTable() {
    cohortMatchingBadge.textContent = `Matching: ${totalMatching} ${totalMatching === 1 ? 'concept' : 'concepts'}`;

    if (currentRecords.length === 0) {
      cohortTableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 3rem;">
            <div class="empty-state" style="height: auto;">
              <p>No concepts match the active filter criteria.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    cohortTableBody.innerHTML = currentRecords.map(item => {
      let sysBadgeClass = 'badge-system-ayurveda';
      if (item.system.toLowerCase() === 'siddha') sysBadgeClass = 'badge-system-siddha';
      if (item.system.toLowerCase() === 'unani') sysBadgeClass = 'badge-system-unani';

      let mappingPillClass = 'pill-sm unmapped';
      let mappingLabel = 'Unmapped';
      if (item.mappingStatus === 'mapped') {
        mappingPillClass = 'pill-sm mapped';
        mappingLabel = 'Dual Coded';
      } else if (item.mappingStatus === 'partially_mapped') {
        mappingPillClass = 'pill-sm partially';
        mappingLabel = 'Partially Mapped';
      }

      let verifPillClass = 'pill-sm unmapped';
      if (item.verificationStatus === 'verified') verifPillClass = 'pill-sm verified';
      if (item.verificationStatus === 'flagged') verifPillClass = 'pill-sm flagged';
      if (item.verificationStatus === 'pending_review') verifPillClass = 'pill-sm partially';

      const shortDef = item.definition ? (item.definition.substring(0, 90) + (item.definition.length > 90 ? '...' : '')) : '-';

      return `
        <tr data-record-id="${escapeHtml(item.id)}" data-system="${escapeHtml(item.system)}">
          <td><span class="badge-system ${sysBadgeClass}">${escapeHtml(item.system)}</span></td>
          <td style="font-family: var(--font-family-code); color: var(--text-light);">${escapeHtml(item.id)}</td>
          <td><span class="badge-code">${escapeHtml(item.code)}</span></td>
          <td class="table-term-cell"><strong>${escapeHtml(item.term)}</strong></td>
          <td class="table-def-cell" title="Click to view complete definition">
            ${escapeHtml(shortDef)}
          </td>
          <td>
            ${item.icd11Tm2 && item.icd11Tm2.code !== 'N/A'
              ? `<code>${escapeHtml(item.icd11Tm2.code)}</code> <small style="display:block; color:var(--text-light);">${escapeHtml(item.icd11Tm2.display)}</small>`
              : '<span style="color:#94a3b8; font-size:0.85rem;">Not Mapped</span>'}
          </td>
          <td>
            ${item.icd11Biomedical && item.icd11Biomedical.code !== 'N/A'
              ? `<code>${escapeHtml(item.icd11Biomedical.code)}</code> <small style="display:block; color:var(--text-light);">${escapeHtml(item.icd11Biomedical.display)}</small>`
              : '<span style="color:#94a3b8; font-size:0.85rem;">Not Mapped</span>'}
          </td>
          <td><span class="${mappingPillClass}">${mappingLabel}</span></td>
          <td><span class="${verifPillClass}">${escapeHtml(item.verificationStatus)}</span></td>
        </tr>
      `;
    }).join('');

    // Attach row click listeners to view definition details
    cohortTableBody.querySelectorAll('tr').forEach((row, index) => {
      row.addEventListener('click', () => {
        if (currentRecords[index]) {
          openDefinitionModal(currentRecords[index]);
        }
      });
    });
  }

  function updateCohortPagination() {
    cohortPaginationInfo.textContent = `Page ${currentPage} of ${totalPages} (${totalMatching} total records)`;
    cohortPrevBtn.disabled = (currentPage <= 1);
    cohortNextBtn.disabled = (currentPage >= totalPages);
  }

  cohortPrevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      fetchCohortRecords();
    }
  });

  cohortNextBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      fetchCohortRecords();
    }
  });

  applyCohortBtn.addEventListener('click', () => {
    currentPage = 1;
    fetchCohortRecords();
  });

  resetCohortBtn.addEventListener('click', () => {
    cohortSystem.value = 'all';
    cohortQuery.value = '';
    cohortTm2Code.value = '';
    cohortBiomedCode.value = '';
    cohortMappingStatus.value = 'all';
    cohortVerificationStatus.value = 'all';
    cohortLimit.value = '25';
    currentPage = 1;
    fetchCohortRecords();
  });

  cohortLimit.addEventListener('change', () => {
    currentPage = 1;
    fetchCohortRecords();
  });

  // --- Definition Modal Helper ---
  function openDefinitionModal(record) {
    defModalTitle.textContent = record.term;
    defModalSystemBadge.textContent = record.system;
    defModalSystemBadge.className = `badge-system badge-system-${record.system.toLowerCase()}`;
    defModalCodeBadge.textContent = record.code;
    defModalText.textContent = record.definition || 'No definition available for this term.';

    // TM2
    if (record.icd11Tm2 && record.icd11Tm2.code && record.icd11Tm2.code !== 'N/A') {
      defModalTm2.innerHTML = `<code>${escapeHtml(record.icd11Tm2.code)}</code> - ${escapeHtml(record.icd11Tm2.display)}`;
    } else {
      defModalTm2.innerHTML = '<span style="color: #94a3b8;">Not Mapped (N/A)</span>';
    }

    // Biomed
    if (record.icd11Biomedical && record.icd11Biomedical.code && record.icd11Biomedical.code !== 'N/A') {
      defModalBiomed.innerHTML = `<code>${escapeHtml(record.icd11Biomedical.code)}</code> - ${escapeHtml(record.icd11Biomedical.display)}`;
    } else {
      defModalBiomed.innerHTML = '<span style="color: #94a3b8;">Not Mapped (N/A)</span>';
    }

    defModal.style.display = 'flex';
  }

  function closeDefinitionModal() {
    defModal.style.display = 'none';
  }

  closeDefModalBtn.addEventListener('click', closeDefinitionModal);
  closeDefModalFooterBtn.addEventListener('click', closeDefinitionModal);
  defModal.addEventListener('click', (e) => {
    if (e.target === defModal) closeDefinitionModal();
  });

  // --- Export Functionality (CSV & JSON) ---
  exportCsvBtn.addEventListener('click', () => triggerDatasetExport('csv'));
  exportJsonBtn.addEventListener('click', () => triggerDatasetExport('json'));

  async function triggerDatasetExport(format) {
    const isCsv = (format === 'csv');
    const btn = isCsv ? exportCsvBtn : exportJsonBtn;
    const label = isCsv ? exportCsvLabel : exportJsonLabel;
    const originalLabel = isCsv ? 'Export CSV' : 'Export JSON';

    btn.disabled = true;
    label.innerHTML = `<span class="spinner-sm"></span> Generating ${format.toUpperCase()}...`;

    try {
      const filters = getActiveFilters();
      // Remove pagination for full export
      delete filters.page;
      delete filters.limit;
      filters.format = format;

      const params = new URLSearchParams(filters);
      const url = `/api/research/export?${params.toString()}`;

      const response = await fetch(url, { headers: getAuthHeaders() });

      if (!response.ok) {
        throw new Error(`Export failed with HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('content-disposition') || '';
      let filename = `ayush-research-export-${Date.now()}.${format}`;
      const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }

      // Trigger client-side download
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      a.remove();

      showToast(`Successfully exported cohort to ${filename}`, 'success');
    } catch (err) {
      console.error('Export error:', err);
      showToast(`Export error: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      label.textContent = originalLabel;
    }
  }

  // --- Auth Modal Configuration ---
  openAuthModalBtn.addEventListener('click', () => {
    authModal.style.display = 'flex';
  });

  closeAuthModalBtn.addEventListener('click', () => {
    authModal.style.display = 'none';
  });

  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) authModal.style.display = 'none';
  });

  saveAuthTokenBtn.addEventListener('click', () => {
    const newToken = researcherTokenInput.value.trim();
    if (!newToken) {
      showToast('Token cannot be empty.', 'error');
      return;
    }
    researcherToken = newToken;
    localStorage.setItem('ayush_researcher_token', researcherToken);
    updateAuthUI();
    authModal.style.display = 'none';
    showToast('Researcher authentication token updated.', 'success');
    fetchCohortRecords();
  });

  resetAuthTokenBtn.addEventListener('click', () => {
    researcherToken = DEFAULT_DEV_TOKEN;
    localStorage.removeItem('ayush_researcher_token');
    updateAuthUI();
    authModal.style.display = 'none';
    showToast('Reset to default developer token.', 'info');
    fetchCohortRecords();
  });

  // Initial load
  updateAuthUI();
  // Auto-run default SF60 lookup to demonstrate TM2 crosswalk immediately
  tm2LookupForm.dispatchEvent(new Event('submit'));
});
