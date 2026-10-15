document.addEventListener('DOMContentLoaded', () => {
  // --- State ---
  let searchMode = 'code'; // 'code' or 'name'
  let currentResolutionData = null;

  // --- Elements ---
  const modeCodeBtn = document.getElementById('modeCodeBtn');
  const modeNameBtn = document.getElementById('modeNameBtn');
  const searchLabel = document.getElementById('searchLabel');
  const claimSearchInput = document.getElementById('claimSearchInput');
  const claimRefInput = document.getElementById('claimRefInput');
  const genClaimRefBtn = document.getElementById('genClaimRefBtn');
  const systemSelect = document.getElementById('systemSelect');
  const resolveClaimBtn = document.getElementById('resolveClaimBtn');
  const clearFormBtn = document.getElementById('clearFormBtn');

  // Ambiguity Elements
  const ambiguityContainer = document.getElementById('ambiguityContainer');
  const ambiguityList = document.getElementById('ambiguityList');
  const ambiguityCountBadge = document.getElementById('ambiguityCountBadge');

  // Resolution Elements
  const resolutionPanel = document.getElementById('resolutionPanel');
  const outcomeBanner = document.getElementById('outcomeBanner');
  const outcomeIcon = document.getElementById('outcomeIcon');
  const outcomeTitle = document.getElementById('outcomeTitle');
  const outcomeDescription = document.getElementById('outcomeDescription');
  const outcomeBadgeContainer = document.getElementById('outcomeBadgeContainer');
  const regulatoryAlert = document.getElementById('regulatoryAlert');

  // Details Values
  const resClaimRef = document.getElementById('resClaimRef');
  const resSystem = document.getElementById('resSystem');
  const resCode = document.getElementById('resCode');
  const resTerm = document.getElementById('resTerm');
  const resCompositeKey = document.getElementById('resCompositeKey');
  const resAdminStatus = document.getElementById('resAdminStatus');
  const resDefinition = document.getElementById('resDefinition');

  const resTm2Code = document.getElementById('resTm2Code');
  const resTm2Display = document.getElementById('resTm2Display');
  const resBiomedCode = document.getElementById('resBiomedCode');
  const resBiomedDisplay = document.getElementById('resBiomedDisplay');
  const resCompleteness = document.getElementById('resCompleteness');
  const resOutcomeStatus = document.getElementById('resOutcomeStatus');
  const resReviewRequired = document.getElementById('resReviewRequired');

  // Actions
  const openReviewRequestModalBtn = document.getElementById('openReviewRequestModalBtn');
  const copyDetailsBtn = document.getElementById('copyDetailsBtn');
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  const resolveAnotherBtn = document.getElementById('resolveAnotherBtn');

  // Modal Elements
  const reviewRequestModal = document.getElementById('reviewRequestModal');
  const reqClaimRef = document.getElementById('reqClaimRef');
  const reqSystem = document.getElementById('reqSystem');
  const reqCode = document.getElementById('reqCode');
  const reqTerm = document.getElementById('reqTerm');
  const reviewReasonSelect = document.getElementById('reviewReasonSelect');
  const reviewNotes = document.getElementById('reviewNotes');
  const reviewProcessorId = document.getElementById('reviewProcessorId');
  const submitReviewRequestBtn = document.getElementById('submitReviewRequestBtn');

  const toastContainer = document.getElementById('toastContainer');

  // --- Initial Setup ---
  init();

  function init() {
    setupModeToggle();
    setupEventListeners();
  }

  // --- Mode Toggle Logic ---
  function setupModeToggle() {
    modeCodeBtn.addEventListener('click', () => {
      searchMode = 'code';
      modeCodeBtn.classList.add('active');
      modeNameBtn.classList.remove('active');
      searchLabel.innerHTML = 'NAMASTE Diagnosis Code <span style="color: var(--danger-color);">*</span>';
      claimSearchInput.placeholder = 'e.g., SID-002, AYU-001, or NUMC-003';
      ambiguityContainer.style.display = 'none';
    });

    modeNameBtn.addEventListener('click', () => {
      searchMode = 'name';
      modeNameBtn.classList.add('active');
      modeCodeBtn.classList.remove('active');
      searchLabel.innerHTML = 'Clinical Diagnosis Name / Term <span style="color: var(--danger-color);">*</span>';
      claimSearchInput.placeholder = 'e.g., Pitham, Jwara, Amavata, or Migraine';
    });
  }

  function setupEventListeners() {
    genClaimRefBtn.addEventListener('click', () => {
      const randNum = Math.floor(10000 + Math.random() * 90000);
      claimRefInput.value = `CLM-2026-${randNum}`;
      showToast('Generated new Claim Reference ID', 'info');
    });

    resolveClaimBtn.addEventListener('click', handleResolveSubmit);

    clearFormBtn.addEventListener('click', () => {
      claimSearchInput.value = '';
      ambiguityContainer.style.display = 'none';
      resolutionPanel.style.display = 'none';
      currentResolutionData = null;
      claimSearchInput.focus();
    });

    resolveAnotherBtn.addEventListener('click', () => {
      resolutionPanel.style.display = 'none';
      ambiguityContainer.style.display = 'none';
      claimSearchInput.focus();
      claimSearchInput.select();
    });

    // Copy to clipboard
    copyDetailsBtn.addEventListener('click', copyAdjudicationSummary);

    // Export JSON
    exportJsonBtn.addEventListener('click', exportAdjudicationJson);

    // Open Modal
    openReviewRequestModalBtn.addEventListener('click', openReviewModal);

    // Submit Review Request
    submitReviewRequestBtn.addEventListener('click', submitReviewRequest);

    // Modal Close
    document.addEventListener('click', (e) => {
      if (e.target.dataset.closeModal || e.target.closest('[data-close-modal]')) {
        closeModals();
      }
      if (e.target.classList.contains('modal-overlay')) {
        closeModals();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModals();
    });
  }

  // --- Claim Resolution Submission Handler ---
  async function handleResolveSubmit() {
    const query = claimSearchInput.value.trim();
    const system = systemSelect.value;
    const claimRef = claimRefInput.value.trim() || `CLM-AUTOGEN-${Date.now().toString().slice(-5)}`;

    if (!query) {
      showToast('Please enter a diagnosis code or name to resolve.', 'error');
      claimSearchInput.focus();
      return;
    }

    if (searchMode === 'code') {
      ambiguityContainer.style.display = 'none';
      await resolveDirectCode(system, query, claimRef);
    } else {
      await searchAmbiguityCandidates(system, query, claimRef);
    }
  }

  // --- Direct Code Resolution (GET /api/claims/resolve) ---
  async function resolveDirectCode(system, code, claimRef) {
    resolveClaimBtn.disabled = true;
    resolveClaimBtn.innerHTML = '<span>Resolving...</span>';

    try {
      const url = `/api/claims/resolve?system=${encodeURIComponent(system)}&code=${encodeURIComponent(code)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok && data.outcome !== 'unrecognized_code' && data.outcome !== 'invalid_code') {
        throw new Error(data.message || 'Error resolving claim code');
      }

      currentResolutionData = { ...data, claimReference: claimRef };
      renderResolutionCard(currentResolutionData);
    } catch (error) {
      console.error('Resolution error:', error);
      showToast(error.message, 'error');
    } finally {
      resolveClaimBtn.disabled = false;
      resolveClaimBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M10.854 5.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 7.793l2.646-2.647a.5.5 0 0 1 .708 0z"/><path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2zm10-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1z"/></svg>
        <span>Resolve Claim</span>
      `;
    }
  }

  // --- Ambiguity Resolution (GET /api/claims/search) ---
  async function searchAmbiguityCandidates(system, query, claimRef) {
    resolveClaimBtn.disabled = true;
    resolveClaimBtn.innerHTML = '<span>Searching...</span>';

    try {
      const url = `/api/claims/search?system=${encodeURIComponent(system)}&q=${encodeURIComponent(query)}&limit=15`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Search failed');

      const matches = data.results || [];
      ambiguityCountBadge.textContent = `${matches.length} candidate${matches.length === 1 ? '' : 's'}`;

      if (matches.length === 0) {
        ambiguityList.innerHTML = `
          <div class="empty-state" style="padding: 2rem; height: auto;">
            <h4>No diagnoses matching "${escapeHtml(query)}" in ${escapeHtml(system)}</h4>
            <p>Check the spelling or try searching by tradition diagnosis code.</p>
          </div>
        `;
        ambiguityContainer.style.display = 'block';
        resolutionPanel.style.display = 'none';
        return;
      }

      // If exactly 1 match found, resolve it directly
      if (matches.length === 1) {
        ambiguityContainer.style.display = 'none';
        await resolveDirectCode(matches[0].system, matches[0].code, claimRef);
        return;
      }

      // Multiple matches: display candidate selection list
      ambiguityList.innerHTML = '';
      matches.forEach(item => {
        const div = document.createElement('div');
        div.className = 'ambiguity-item';
        div.innerHTML = `
          <div>
            <div>
              <span class="ambiguity-term">${escapeHtml(item.term)}</span>
              <span class="ambiguity-code">[${escapeHtml(item.code)}]</span>
              <span class="badge ${getStatusBadgeClass(item.reviewStatus)}" style="margin-left: 0.5rem;">${escapeHtml(item.reviewStatus)}</span>
            </div>
            <div class="ambiguity-def">${escapeHtml(item.definition || 'No definition available.')}</div>
            <div style="font-size: 0.78rem; color: var(--text-light); margin-top: 0.2rem;">
              TM2: <strong>${escapeHtml(item.tm2Code || 'N/A')}</strong> | Biomed: <strong>${escapeHtml(item.biomedCode || 'N/A')}</strong>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" data-select-code="${escapeHtml(item.code)}" data-select-system="${escapeHtml(item.system)}">
            Select & Resolve
          </button>
        `;
        ambiguityList.appendChild(div);
      });

      ambiguityContainer.style.display = 'block';
      resolutionPanel.style.display = 'none';

      // Delegate select buttons
      ambiguityList.querySelectorAll('button[data-select-code]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const selCode = btn.dataset.selectCode;
          const selSys = btn.dataset.selectSystem;
          ambiguityContainer.style.display = 'none';
          claimSearchInput.value = selCode;
          await resolveDirectCode(selSys, selCode, claimRef);
        });
      });
    } catch (error) {
      console.error('Ambiguity search error:', error);
      showToast(error.message, 'error');
    } finally {
      resolveClaimBtn.disabled = false;
      resolveClaimBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M10.854 5.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 7.793l2.646-2.647a.5.5 0 0 1 .708 0z"/><path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2zm10-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1z"/></svg>
        <span>Resolve Claim</span>
      `;
    }
  }

  // --- Render Resolution Results Card ---
  function renderResolutionCard(data) {
    resolutionPanel.style.display = 'block';
    resolutionPanel.scrollIntoView({ behavior: 'smooth' });

    // Outcome Theme & Content
    outcomeBanner.className = `outcome-banner outcome-${data.outcome}`;

    const outcomeConfigs = {
      mapped: {
        title: 'Dual-Coding Crosswalk Available & Verified',
        desc: 'This AYUSH diagnosis possesses verified mappings to both WHO ICD-11 TM2 and Biomedical crosswalks.',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>',
        badge: '<span class="badge badge-verified">Mapped & Verified</span>'
      },
      partially_mapped: {
        title: 'Partially Mapped Crosswalk',
        desc: 'Concept has a primary ICD-11 TM2 mapping, but lacks a corresponding biomedical crosswalk.',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0z"/></svg>',
        badge: '<span class="badge badge-pending">Partially Mapped</span>'
      },
      unmapped: {
        title: 'Unmapped to WHO ICD-11 TM2 (Manual Review Required)',
        desc: 'This standardized AYUSH term lacks an automated WHO ICD-11 TM2 crosswalk. Route to manual medical review.',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M4.646 4.646a.5.5 0 0 1 .708 0L11.354 10.646a.5.5 0 0 1-.708.708L4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>',
        badge: '<span class="badge badge-unmapped">Unmapped - Review Required</span>'
      },
      unverified: {
        title: 'Crosswalk Assigned (Awaiting Clinical Verification)',
        desc: 'Dual-coding matches are present, but administrator clinical verification has not been finalized.',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>',
        badge: '<span class="badge badge-pending">Unverified Clinical State</span>'
      },
      flagged: {
        title: 'Flagged Clinical Mapping (Discrepancy Reported)',
        desc: 'A Healthcare Administrator flagged this mapping for review or revision. Requires manual review.',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M14.778.085A.5.5 0 0 1 15 .5V8a.5.5 0 0 1-.314.464L14.5 8l.186.464-.003.001-.006.003-.023.009a12.435 12.435 0 0 1-.397.15c-.264.095-.631.223-1.046.35-.828.252-1.92.52-3.26.52-1.34 0-2.432-.268-3.26-.52-.415-.127-.782-.255-1.046-.35a12.39 12.39 0 0 0-.42-.158L5 8.5v6.5a.5.5 0 0 1-1 0V.5a.5.5 0 0 1 .28-.445.5.5 0 0 1 .534.072l.005.004.015.011a12.22 12.22 0 0 1 .465.344c.31.23.75.525 1.277.77C7.625 1.732 8.742 2 10 2c1.258 0 2.375-.268 3.424-.744.526-.245.966-.54 1.276-.77a12.235 12.235 0 0 1 .48-.355l.015-.01.004-.004.002-.002z"/></svg>',
        badge: '<span class="badge badge-flagged">Flagged Concept</span>'
      },
      unrecognized_code: {
        title: 'Unrecognized Diagnosis Code',
        desc: `Code '${escapeHtml(data.code || '')}' was not found in ${escapeHtml(data.system || '')}. Please verify the code and tradition.`,
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/></svg>',
        badge: '<span class="badge badge-unmapped">Unrecognized Code</span>'
      },
      invalid_code: {
        title: 'Invalid Input / Malformed Request',
        desc: data.message || 'Please provide a valid tradition and code.',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/></svg>',
        badge: '<span class="badge badge-unmapped">Invalid Input</span>'
      }
    };

    const cfg = outcomeConfigs[data.outcome] || outcomeConfigs.unmapped;
    outcomeIcon.innerHTML = cfg.icon;
    outcomeTitle.textContent = cfg.title;
    outcomeDescription.textContent = cfg.desc;
    outcomeBadgeContainer.innerHTML = cfg.badge;

    // Show/hide regulatory alert (show whenever manual review is recommended)
    if (data.requiresManualReview || data.outcome === 'unmapped' || data.outcome === 'flagged') {
      regulatoryAlert.style.display = 'flex';
    } else {
      regulatoryAlert.style.display = 'none';
    }

    if (!data.resolved || !data.record) {
      // Unrecognized or invalid
      resClaimRef.textContent = data.claimReference || '--';
      resSystem.textContent = data.system || '--';
      resCode.textContent = data.code || '--';
      resTerm.textContent = 'None';
      resCompositeKey.textContent = '--';
      resAdminStatus.textContent = '--';
      resDefinition.textContent = 'Code not recognized in terminology database.';

      resTm2Code.textContent = 'N/A';
      resTm2Display.textContent = 'None';
      resBiomedCode.textContent = 'N/A';
      resBiomedDisplay.textContent = 'None';
      resCompleteness.textContent = 'Unmapped';
      resOutcomeStatus.textContent = data.outcome.toUpperCase();
      resReviewRequired.textContent = 'Yes (Unrecognized Code)';
      openReviewRequestModalBtn.style.display = 'none';
      return;
    }

    openReviewRequestModalBtn.style.display = 'inline-flex';

    // Populate Left Card
    resClaimRef.textContent = data.claimReference;
    resSystem.textContent = data.record.system;
    resCode.textContent = data.record.code;
    resTerm.textContent = data.record.term;
    resCompositeKey.textContent = data.record.compositeKey;
    resDefinition.textContent = data.record.definition || 'No definition recorded.';

    const adminSt = data.adminReview ? data.adminReview.status : 'pending_review';
    resAdminStatus.innerHTML = `<span class="badge ${getStatusBadgeClass(adminSt)}">${escapeHtml(adminSt)}</span>`;

    // Populate Right Card
    const tm2 = data.crosswalks ? data.crosswalks.tm2 : {};
    const biomed = data.crosswalks ? data.crosswalks.biomed : {};

    resTm2Code.textContent = tm2.code || 'N/A';
    resTm2Display.textContent = tm2.display || 'Not Mapped';
    resBiomedCode.textContent = biomed.code || 'N/A';
    resBiomedDisplay.textContent = biomed.display || 'Not Mapped';
    resCompleteness.textContent = data.mappingCompleteness ? data.mappingCompleteness.toUpperCase() : 'UNKNOWN';
    resOutcomeStatus.innerHTML = `<strong style="color: var(--primary-color);">${escapeHtml(data.outcome.toUpperCase())}</strong>`;
    resReviewRequired.innerHTML = data.requiresManualReview
      ? '<span style="color: #c62828; font-weight: 700;">YES (Manual Medical Review Required)</span>'
      : '<span style="color: #2e7d32; font-weight: 700;">NO (Automated Adjudication Ready)</span>';
  }

  // --- Modal: Open Review Request Modal ---
  function openReviewModal() {
    if (!currentResolutionData || !currentResolutionData.record) {
      showToast('Please resolve a claim before opening review request.', 'error');
      return;
    }

    const rec = currentResolutionData.record;
    reqClaimRef.textContent = currentResolutionData.claimReference;
    reqSystem.textContent = rec.system;
    reqCode.textContent = rec.code;
    reqTerm.textContent = rec.term;

    // Default reason according to outcome
    if (currentResolutionData.outcome === 'unmapped') {
      reviewReasonSelect.value = 'tm2_mapping_missing';
    } else if (currentResolutionData.outcome === 'partially_mapped') {
      reviewReasonSelect.value = 'biomedical_missing';
    } else if (currentResolutionData.outcome === 'flagged') {
      reviewReasonSelect.value = 'flagged_by_admin';
    } else {
      reviewReasonSelect.value = 'inconsistent_mapping';
    }

    reviewNotes.value = `Manual medical review requested for Claim '${currentResolutionData.claimReference}'. Resolution outcome: ${currentResolutionData.outcome.toUpperCase()}.`;
    reviewRequestModal.classList.add('active');
  }

  // --- Modal: Submit Review Request (POST /api/claims/review-requests) ---
  async function submitReviewRequest() {
    if (!currentResolutionData || !currentResolutionData.record) return;

    const claimReference = currentResolutionData.claimReference;
    const rec = currentResolutionData.record;
    const reason = reviewReasonSelect.value;
    const notes = reviewNotes.value.trim();
    const requestedBy = reviewProcessorId.value.trim() || 'claims_processor';

    submitReviewRequestBtn.disabled = true;
    submitReviewRequestBtn.textContent = 'Submitting Request...';

    try {
      const response = await fetch('/api/claims/review-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimReference,
          system: rec.system,
          recordId: rec.id,
          code: rec.code,
          term: rec.term,
          reason,
          notes,
          requestedBy,
          resolutionOutcome: currentResolutionData.outcome
        })
      });

      const result = await response.json();

      if (response.status === 409) {
        // Duplicate detection
        showToast(`Duplicate: An active review request (${result.existingRequest.id}) already exists for this claim reference.`, 'error');
        closeModals();
        return;
      }

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Failed to submit review request');
      }

      showToast(`Manual review request (${result.request.id}) submitted successfully!`, 'success');
      closeModals();
    } catch (error) {
      console.error('Submission error:', error);
      showToast(error.message, 'error');
    } finally {
      submitReviewRequestBtn.disabled = false;
      submitReviewRequestBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/></svg>
        <span>Submit Review Request</span>
      `;
    }
  }

  // --- Copy Summary to Clipboard ---
  function copyAdjudicationSummary() {
    if (!currentResolutionData || !currentResolutionData.record) return;

    const data = currentResolutionData;
    const text = [
      `=== AYUSH CLAIMS ADJUDICATION SUMMARY ===`,
      `Claim Reference: ${data.claimReference}`,
      `Tradition: ${data.record.system}`,
      `NAMASTE Code: ${data.record.code}`,
      `Diagnosis Term: ${data.record.term}`,
      `Resolution Outcome: ${data.outcome.toUpperCase()}`,
      `ICD-11 TM2: ${data.crosswalks.tm2.code} (${data.crosswalks.tm2.display})`,
      `ICD-11 Biomedicine: ${data.crosswalks.biomed.code} (${data.crosswalks.biomed.display})`,
      `Admin Review Status: ${data.adminReview.status}`,
      `Manual Medical Review Required: ${data.requiresManualReview ? 'YES' : 'NO'}`,
      `Statutory Guideline: ${data.regulatoryGuidance}`,
      `Generated at: ${new Date().toISOString()}`
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      showToast('Adjudication summary copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Failed to copy to clipboard', 'error');
    });
  }

  // --- Export JSON ---
  function exportAdjudicationJson() {
    if (!currentResolutionData) return;

    const jsonStr = JSON.stringify(currentResolutionData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `claim-resolution-${currentResolutionData.claimReference || 'export'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported resolution JSON', 'info');
  }

  // --- Helper: Badge Classes ---
  function getStatusBadgeClass(status) {
    if (!status) return 'badge-unmapped';
    const s = status.toLowerCase();
    if (s === 'verified') return 'badge-verified';
    if (s === 'flagged') return 'badge-flagged';
    if (s === 'pending_review' || s === 'pending') return 'badge-pending';
    return 'badge-unmapped';
  }

  function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#2e7d32" viewBox="0 0 16 16"><path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#c62828" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0z"/></svg>';
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
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
      .replace(/'/g, '&#39;');
  }
});
