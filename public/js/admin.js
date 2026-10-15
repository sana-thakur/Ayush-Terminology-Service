document.addEventListener('DOMContentLoaded', () => {
  // --- Admin Token State ---
  const DEFAULT_DEV_TOKEN = 'admin-secret-dev-token-2026';
  let adminToken = localStorage.getItem('ayush_admin_token') || DEFAULT_DEV_TOKEN;

  // --- Table & Filter State ---
  let currentPage = 1;
  let totalPages = 1;
  let totalRecords = 0;
  let currentRecords = [];
  let activeRecord = null; // currently selected record for modal
  let searchDebounceTimer = null;

  // --- DOM Elements ---
  const searchInput = document.getElementById('searchInput');
  const systemFilter = document.getElementById('systemFilter');
  const statusFilter = document.getElementById('statusFilter');
  const limitSelect = document.getElementById('limitSelect');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  const refreshBtn = document.getElementById('refreshBtn');

  const mappingsTableBody = document.getElementById('mappingsTableBody');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const paginationInfo = document.getElementById('paginationInfo');

  // KPI elements
  const statTotal = document.getElementById('statTotal');
  const statVerified = document.getElementById('statVerified');
  const statFlagged = document.getElementById('statFlagged');
  const statPending = document.getElementById('statPending');
  const statUnmapped = document.getElementById('statUnmapped');

  // Auth UI
  const authStatusText = document.getElementById('authStatusText');
  const openAuthModalBtn = document.getElementById('openAuthModalBtn');
  const adminTokenInput = document.getElementById('adminTokenInput');
  const saveAuthTokenBtn = document.getElementById('saveAuthTokenBtn');
  const resetAuthTokenBtn = document.getElementById('resetAuthTokenBtn');

  // Verify Modal Elements
  const verifyModal = document.getElementById('verifyModal');
  const verifyTermName = document.getElementById('verifyTermName');
  const verifySystemId = document.getElementById('verifySystemId');
  const verifyCode = document.getElementById('verifyCode');
  const verifyFingerprint = document.getElementById('verifyFingerprint');
  const verifyTm2 = document.getElementById('verifyTm2');
  const verifyBiomed = document.getElementById('verifyBiomed');
  const verifyNotes = document.getElementById('verifyNotes');
  const verifyReviewer = document.getElementById('verifyReviewer');
  const confirmVerifyBtn = document.getElementById('confirmVerifyBtn');

  // Flag Modal Elements
  const flagModal = document.getElementById('flagModal');
  const flagTermName = document.getElementById('flagTermName');
  const flagSystemId = document.getElementById('flagSystemId');
  const flagCode = document.getElementById('flagCode');
  const flagCurrentStatus = document.getElementById('flagCurrentStatus');
  const flagReasonCategory = document.getElementById('flagReasonCategory');
  const flagDescription = document.getElementById('flagDescription');
  const flagSuggestion = document.getElementById('flagSuggestion');
  const flagReviewer = document.getElementById('flagReviewer');
  const confirmFlagBtn = document.getElementById('confirmFlagBtn');

  // History Modal Elements
  const historyModal = document.getElementById('historyModal');
  const historyTermName = document.getElementById('historyTermName');
  const historySystemId = document.getElementById('historySystemId');
  const historyCode = document.getElementById('historyCode');
  const historyCompositeKey = document.getElementById('historyCompositeKey');
  const historyTimelineContainer = document.getElementById('historyTimelineContainer');

  // Toast Container
  const toastContainer = document.getElementById('toastContainer');

  // --- Initialize UI ---
  updateAuthUI();
  fetchStats();
  fetchRecords();

  // --- Auth & Header Functions ---
  function updateAuthUI() {
    if (adminToken) {
      authStatusText.textContent = `Active (Dev Token: ${adminToken.substring(0, 16)}...)`;
      adminTokenInput.value = adminToken;
    } else {
      authStatusText.textContent = 'Unauthenticated';
      adminTokenInput.value = '';
    }
  }

  function getAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    };
  }

  // --- Toast Notification Helper ---
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#2e7d32" viewBox="0 0 16 16"><path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#c62828" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0z"/></svg>';
    }

    toast.innerHTML = `
      ${iconSvg}
      <span>${escapeHtml(message)}</span>
    `;

    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // --- Statistics Loading ---
  async function fetchStats() {
    try {
      const response = await fetch('/api/admin/stats', {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`Failed to load stats: ${response.status}`);
      }

      const data = await response.json();
      const stats = data.stats;

      statTotal.textContent = stats.totalRecords || 0;
      statVerified.textContent = stats.verified || 0;
      statFlagged.textContent = stats.flagged || 0;
      statPending.textContent = stats.pendingReview || 0;
      statUnmapped.textContent = stats.unmapped || 0;

      if (stats.staleVerifications > 0) {
        statPending.innerHTML = `${stats.pendingReview} <small style="font-size: 0.8rem; color: #e65100; font-weight: normal;">(${stats.staleVerifications} stale)</small>`;
      }
    } catch (error) {
      console.warn('Could not load admin stats:', error);
    }
  }

  // --- Table Records Fetching ---
  async function fetchRecords() {
    const q = (searchInput.value || '').trim();
    const system = systemFilter.value;
    const status = statusFilter.value;
    const limit = parseInt(limitSelect.value, 10) || 25;

    mappingsTableBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 3rem;">
          <div class="empty-state" style="height: auto;">
            <p>Loading terminology records...</p>
          </div>
        </td>
      </tr>
    `;

    try {
      const queryParams = new URLSearchParams({
        q,
        system,
        status,
        page: currentPage,
        limit
      });

      const response = await fetch(`/api/terminology/search?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      currentRecords = data.results || [];
      const pagination = data.pagination;

      currentPage = pagination.currentPage;
      totalPages = pagination.totalPages;
      totalRecords = pagination.totalResults;

      renderTable(currentRecords);
      renderPagination(pagination);
    } catch (error) {
      console.error('Error fetching records:', error);
      mappingsTableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 3rem;">
            <div class="empty-state" style="height: auto;">
              <h3 style="color: var(--danger-color);">Error Loading Data</h3>
              <p>${escapeHtml(error.message)}</p>
              <button class="btn btn-secondary btn-sm" onclick="location.reload()" style="margin-top: 1rem;">Retry</button>
            </div>
          </td>
        </tr>
      `;
    }
  }

  // --- Table Rendering ---
  function renderTable(records) {
    if (!records || records.length === 0) {
      mappingsTableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 3rem;">
            <div class="empty-state" style="height: auto;">
              <svg class="empty-state-icon" style="width: 48px; height: 48px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <h3>No matching terminology records found</h3>
              <p>Try modifying your tradition filter, review status, or search terms.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    mappingsTableBody.innerHTML = '';

    records.forEach(item => {
      const tr = document.createElement('tr');
      const compositeKey = item.composite_key || `${item.system.toLowerCase()}-${item.id}`;

      // Tradition badge
      const systemClass = `badge-${item.system.toLowerCase()}`;

      // Status badge
      let statusBadge = '';
      if (item.review_status === 'verified') {
        statusBadge = `<span class="badge badge-verified"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/></svg> Verified</span>`;
      } else if (item.review_status === 'flagged') {
        const flagCat = (item.review_details && item.review_details.flagDetails && item.review_details.flagDetails.reasonCategory)
          ? item.review_details.flagDetails.reasonCategory
          : 'Issue';
        statusBadge = `<span class="badge badge-flagged" title="Flagged: ${escapeHtml(flagCat)}"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="currentColor" viewBox="0 0 16 16"><path d="M14.778.085A.5.5 0 0 1 15 .5V8a.5.5 0 0 1-.314.464L14.5 8l.186.464-.003.001-.006.003-.023.009a12.435 12.435 0 0 1-.397.15c-.264.095-.631.223-1.046.35-.828.252-1.92.52-3.26.52-1.34 0-2.432-.268-3.26-.52-.415-.127-.782-.255-1.046-.35a12.39 12.39 0 0 0-.42-.158L5 8.5v6.5a.5.5 0 0 1-1 0V.5a.5.5 0 0 1 .28-.445.5.5 0 0 1 .534.072l.005.004.015.011a12.22 12.22 0 0 1 .465.344c.31.23.75.525 1.277.77C7.625 1.732 8.742 2 10 2c1.258 0 2.375-.268 3.424-.744.526-.245.966-.54 1.276-.77a12.235 12.235 0 0 1 .48-.355l.015-.01.004-.004.002-.002z"/></svg> Flagged</span>`;
      } else if (item.review_status === 'unmapped') {
        statusBadge = `<span class="badge badge-unmapped">Unmapped</span>`;
      } else {
        // Pending Review
        statusBadge = `<span class="badge badge-pending"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="currentColor" viewBox="0 0 16 16"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg> Pending</span>`;
      }

      if (item.is_stale) {
        statusBadge += `<br><span class="badge badge-stale" style="margin-top: 3px;" title="${escapeHtml(item.stale_reason || 'Underlying data changed')}">Data Changed</span>`;
      }

      // TM2 cell
      let tm2Content = '<span class="mapping-empty">Not Mapped</span>';
      if (item.icd11_tm2_code && item.icd11_tm2_code !== 'N/A') {
        tm2Content = `
          <div class="mapping-code">${escapeHtml(item.icd11_tm2_code)}</div>
          <div class="mapping-display">${escapeHtml(item.icd11_tm2_display)}</div>
        `;
      }

      // Biomed cell
      let biomedContent = '<span class="mapping-empty">Not Mapped</span>';
      if (item.icd11_biomed_code && item.icd11_biomed_code !== 'N/A') {
        biomedContent = `
          <div class="mapping-code">${escapeHtml(item.icd11_biomed_code)}</div>
          <div class="mapping-display">${escapeHtml(item.icd11_biomed_display)}</div>
        `;
      }

      // Is verify button disabled?
      const isUnmapped = (item.mapping_completeness === 'unmapped');
      const verifyDisabledAttr = isUnmapped ? 'disabled title="Cannot verify unmapped record. Valid TM2 or Biomedical mapping required."' : 'title="Approve and verify mapping"';

      tr.innerHTML = `
        <td><span class="badge ${systemClass}">${escapeHtml(item.system)}</span></td>
        <td style="color: var(--text-light); font-size: 0.8rem;">${escapeHtml(item.id)}</td>
        <td class="code-cell">${escapeHtml(item.code)}</td>
        <td class="term-cell">${escapeHtml(item.term)}</td>
        <td class="def-cell">
          <div class="def-text" onclick="this.classList.toggle('expanded')" title="Click to expand/collapse definition">
            ${escapeHtml(item.definition || 'No definition available.')}
          </div>
        </td>
        <td class="mapping-cell">${tm2Content}</td>
        <td class="mapping-cell">${biomedContent}</td>
        <td>${statusBadge}</td>
        <td>
          <div class="action-buttons">
            <button class="btn btn-sm btn-verify" data-action="verify" data-key="${compositeKey}" ${verifyDisabledAttr}>
              Verify
            </button>
            <button class="btn btn-sm btn-flag" data-action="flag" data-key="${compositeKey}" title="Report or flag mapping issue">
              Flag
            </button>
            <button class="btn btn-sm btn-history" data-action="history" data-key="${compositeKey}" title="View chronological action audit history">
              History
            </button>
          </div>
        </td>
      `;

      mappingsTableBody.appendChild(tr);
    });
  }

  function renderPagination(pagination) {
    paginationInfo.textContent = `Page ${pagination.currentPage} of ${pagination.totalPages} (${pagination.totalResults} records)`;
    prevBtn.disabled = pagination.currentPage <= 1;
    nextBtn.disabled = pagination.currentPage >= pagination.totalPages;
  }

  // --- Table Action Button Listeners (Delegated) ---
  mappingsTableBody.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const key = button.dataset.key;
    const record = currentRecords.find(r => (r.composite_key || `${r.system.toLowerCase()}-${r.id}`) === key);

    if (!record) return;
    activeRecord = record;

    if (action === 'verify') {
      openVerifyModal(record);
    } else if (action === 'flag') {
      openFlagModal(record);
    } else if (action === 'history') {
      openHistoryModal(record);
    }
  });

  // --- Modal Openers ---
  function openVerifyModal(record) {
    verifyTermName.textContent = record.term;
    verifySystemId.textContent = `${record.system} (ID: ${record.id})`;
    verifyCode.textContent = record.code;
    verifyFingerprint.textContent = record.current_fingerprint || 'N/A';

    verifyTm2.textContent = (record.icd11_tm2_code && record.icd11_tm2_code !== 'N/A')
      ? `${record.icd11_tm2_code} - ${record.icd11_tm2_display}`
      : 'None (Unmapped)';

    verifyBiomed.textContent = (record.icd11_biomed_code && record.icd11_biomed_code !== 'N/A')
      ? `${record.icd11_biomed_code} - ${record.icd11_biomed_display}`
      : 'None (Unmapped)';

    verifyNotes.value = (record.review_details && record.review_details.lastNotes) || '';
    verifyReviewer.value = 'admin';

    verifyModal.classList.add('active');
  }

  function openFlagModal(record) {
    flagTermName.textContent = record.term;
    flagSystemId.textContent = `${record.system} (ID: ${record.id})`;
    flagCode.textContent = record.code;
    flagCurrentStatus.textContent = record.review_status ? record.review_status.toUpperCase() : 'PENDING';

    flagReasonCategory.value = 'incorrect_mapping';
    flagDescription.value = '';
    flagSuggestion.value = '';
    flagReviewer.value = 'admin';

    flagModal.classList.add('active');
  }

  async function openHistoryModal(record) {
    historyTermName.textContent = record.term;
    historySystemId.textContent = `${record.system} (ID: ${record.id})`;
    historyCode.textContent = record.code;
    historyCompositeKey.textContent = record.composite_key || `${record.system.toLowerCase()}-${record.id}`;

    historyTimelineContainer.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 1.5rem;">Loading audit history...</p>';
    historyModal.classList.add('active');

    try {
      const response = await fetch(`/api/admin/mappings/${record.system}/${record.id}/history`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`Failed to load history: HTTP ${response.status}`);
      }

      const data = await response.json();
      renderTimeline(data.history);
    } catch (error) {
      historyTimelineContainer.innerHTML = `
        <div style="color: var(--danger-color); padding: 1rem; text-align: center;">
          Failed to load history: ${escapeHtml(error.message)}
        </div>
      `;
    }
  }

  function renderTimeline(history) {
    if (!history || history.length === 0) {
      historyTimelineContainer.innerHTML = `
        <div class="empty-state" style="padding: 2rem 0; height: auto;">
          <svg class="empty-state-icon" style="width: 40px; height: 40px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <h4 style="margin: 0; color: var(--text-color);">No Audit History Recorded</h4>
          <p style="margin-top: 0.25rem;">This concept has not undergone verification or flagging actions yet.</p>
        </div>
      `;
      return;
    }

    let timelineHtml = '<div class="timeline">';

    history.forEach(entry => {
      const isVerified = (entry.status === 'verified' || entry.action === 'VERIFIED');
      const dotClass = isVerified ? 'dot-verified' : 'dot-flagged';
      const badgeClass = isVerified ? 'badge-verified' : 'badge-flagged';
      const formattedDate = new Date(entry.timestamp).toLocaleString();

      let detailsHtml = '';
      if (entry.reasonCategory) {
        detailsHtml += `<div class="timeline-flag-reason">Category: ${escapeHtml(entry.reasonCategory)}</div>`;
      }
      if (entry.description) {
        detailsHtml += `<div class="timeline-notes"><strong>Description:</strong> ${escapeHtml(entry.description)}</div>`;
      }
      if (entry.suggestion) {
        detailsHtml += `<div class="timeline-notes" style="color: #2e7d32;"><strong>Suggestion:</strong> ${escapeHtml(entry.suggestion)}</div>`;
      }
      if (entry.notes) {
        detailsHtml += `<div class="timeline-notes">${escapeHtml(entry.notes)}</div>`;
      }

      timelineHtml += `
        <div class="timeline-item">
          <div class="timeline-dot ${dotClass}"></div>
          <div class="timeline-content">
            <div class="timeline-meta">
              <div>
                <span class="badge ${badgeClass}">${escapeHtml(entry.action || entry.status)}</span>
                <span class="timeline-reviewer" style="margin-left: 0.5rem;">by ${escapeHtml(entry.reviewer || 'admin')}</span>
              </div>
              <span>${formattedDate}</span>
            </div>
            ${detailsHtml}
            <div class="timeline-fingerprint">
              Fingerprint: <code>${escapeHtml(entry.mappingFingerprint || 'N/A')}</code>
            </div>
          </div>
        </div>
      `;
    });

    timelineHtml += '</div>';
    historyTimelineContainer.innerHTML = timelineHtml;
  }

  // --- Verification Submission ---
  confirmVerifyBtn.addEventListener('click', async () => {
    if (!activeRecord) return;

    confirmVerifyBtn.disabled = true;
    confirmVerifyBtn.textContent = 'Verifying...';

    try {
      const response = await fetch(`/api/admin/mappings/${activeRecord.system}/${activeRecord.id}/verify`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          notes: verifyNotes.value.trim(),
          reviewer: verifyReviewer.value.trim() || 'admin'
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Verification failed');
      }

      showToast(`Record '${activeRecord.term}' marked as Verified!`, 'success');
      closeAllModals();
      fetchRecords();
      fetchStats();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      confirmVerifyBtn.disabled = false;
      confirmVerifyBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/></svg>
        <span>Approve & Mark Verified</span>
      `;
    }
  });

  // --- Flag Submission ---
  confirmFlagBtn.addEventListener('click', async () => {
    if (!activeRecord) return;

    const reasonCategory = flagReasonCategory.value;
    const description = flagDescription.value.trim();
    const suggestion = flagSuggestion.value.trim();
    const reviewer = flagReviewer.value.trim() || 'admin';

    if (!description) {
      showToast('Please provide an issue description before submitting flag.', 'error');
      flagDescription.focus();
      return;
    }

    confirmFlagBtn.disabled = true;
    confirmFlagBtn.textContent = 'Submitting Flag...';

    try {
      const response = await fetch(`/api/admin/mappings/${activeRecord.system}/${activeRecord.id}/flag`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          reasonCategory,
          description,
          suggestion,
          reviewer
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Flag submission failed');
      }

      showToast(`Record '${activeRecord.term}' flagged as ${reasonCategory}!`, 'success');
      closeAllModals();
      fetchRecords();
      fetchStats();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      confirmFlagBtn.disabled = false;
      confirmFlagBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M14.778.085A.5.5 0 0 1 15 .5V8a.5.5 0 0 1-.314.464L14.5 8l.186.464-.003.001-.006.003-.023.009a12.435 12.435 0 0 1-.397.15c-.264.095-.631.223-1.046.35-.828.252-1.92.52-3.26.52-1.34 0-2.432-.268-3.26-.52-.415-.127-.782-.255-1.046-.35a12.39 12.39 0 0 0-.42-.158L5 8.5v6.5a.5.5 0 0 1-1 0V.5a.5.5 0 0 1 .28-.445.5.5 0 0 1 .534.072l.005.004.015.011a12.22 12.22 0 0 1 .465.344c.31.23.75.525 1.277.77C7.625 1.732 8.742 2 10 2c1.258 0 2.375-.268 3.424-.744.526-.245.966-.54 1.276-.77a12.235 12.235 0 0 1 .48-.355l.015-.01.004-.004.002-.002z"/></svg>
        <span>Flag Mapping</span>
      `;
    }
  });

  // --- Auth Settings Modal ---
  openAuthModalBtn.addEventListener('click', () => {
    const authModal = document.getElementById('authModal');
    authModal.classList.add('active');
  });

  saveAuthTokenBtn.addEventListener('click', () => {
    const newToken = adminTokenInput.value.trim();
    if (!newToken) {
      showToast('Admin token cannot be empty', 'error');
      return;
    }
    adminToken = newToken;
    localStorage.setItem('ayush_admin_token', adminToken);
    updateAuthUI();
    closeAllModals();
    showToast('Admin Dev Token updated successfully', 'success');
    fetchStats();
    fetchRecords();
  });

  resetAuthTokenBtn.addEventListener('click', () => {
    adminToken = DEFAULT_DEV_TOKEN;
    localStorage.setItem('ayush_admin_token', adminToken);
    updateAuthUI();
    closeAllModals();
    showToast('Reset to default dev token', 'success');
    fetchStats();
    fetchRecords();
  });

  // --- Modal Close Handlers ---
  function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    activeRecord = null;
  }

  document.addEventListener('click', (event) => {
    if (event.target.dataset.closeModal || event.target.closest('[data-close-modal]')) {
      closeAllModals();
    }
    if (event.target.classList.contains('modal-overlay')) {
      closeAllModals();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAllModals();
    }
  });

  // --- Filter and Search Event Handlers ---
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      currentPage = 1;
      fetchRecords();
    }, 300);
  });

  systemFilter.addEventListener('change', () => {
    currentPage = 1;
    fetchRecords();
  });

  statusFilter.addEventListener('change', () => {
    currentPage = 1;
    fetchRecords();
  });

  limitSelect.addEventListener('change', () => {
    currentPage = 1;
    fetchRecords();
  });

  resetFiltersBtn.addEventListener('click', () => {
    searchInput.value = '';
    systemFilter.value = 'all';
    statusFilter.value = 'all';
    limitSelect.value = '25';
    currentPage = 1;
    fetchRecords();
    showToast('Filters reset to default', 'info');
  });

  refreshBtn.addEventListener('click', () => {
    fetchRecords();
    fetchStats();
    showToast('Dashboard data refreshed', 'info');
  });

  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      fetchRecords();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      fetchRecords();
    }
  });

  // Simple HTML Escaper
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
