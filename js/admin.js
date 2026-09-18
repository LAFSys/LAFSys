/**
 * NEW ADMIN DASHBOARD - Complete rewrite
 * This is a clean implementation that ensures no action buttons in Dashboard section
 */

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('Initializing NEW admin panel...');
  
  // Initialize UI components
  if (window.lucide?.createIcons) lucide.createIcons();
  
  // Set up sidebar navigation
  wireSidebar();
  
  // Load the last active section from localStorage or default to dashboard
  const lastActiveSection = localStorage.getItem('adminActiveSection') || 'dashboard';
  console.log('Restoring section:', lastActiveSection);
  
  // Activate the correct section
  activateSection(lastActiveSection);
  
  // Initial loading of all required elements
  watchFoundItemsStats();  // keeps found items total/active live
  renderInbox();
  watchClaimedResolvedCount();
  initAdminLostItems(); // keeps _lostItemsCurrent live; derives active/pending counts internally
  
  // If not on dashboard, load the appropriate section data
  if (lastActiveSection === 'users') renderUsers();
  if (lastActiveSection === 'items') renderAllItems();
  
  if (lastActiveSection === 'archived') renderArchivedItems();

  document.getElementById('archivedTypeFilter')?.addEventListener('change', renderArchivedItems);

  // Setup event listeners for updates
  setupEventListeners();
});

// Set up event listeners for updates
function setupEventListeners() {
  // Update dashboard when items change
  window.addEventListener('itemsUpdated', () => { 
    renderStats(); 
    renderRecentItemsWithoutActions(); 
    renderAllItems(); 
  });
  
  // Message events
  window.addEventListener('messagesUpdated', () => {
    renderInbox();
  });
  
  window.addEventListener('messagesLoaded', () => {
    renderInbox();
  });
  
  window.addEventListener('messageAdded', (event) => {
    const message = event.detail?.message;
    if (message && message.unread) {
      if (document.querySelector('.nav-link.active')?.getAttribute('data-section') !== 'inbox') {
        showDesktopNotification(message);
      }
    }
    forceRefreshInbox();
  });
  
  // Set up periodic inbox refresh
  const inboxRefreshInterval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      forceRefreshInbox();
    }
  }, 30000);
  
  // Clean up interval when page is unloaded
  window.addEventListener('beforeunload', () => {
    clearInterval(inboxRefreshInterval);
  });
}

// Wire up sidebar navigation
function wireSidebar() {
  document.querySelectorAll('.nav-link[data-section]').forEach(link => {
    link.addEventListener('click', (e) => {
      const section = link.getAttribute('data-section');
      if (section === 'add-item' || section === 'claims') return; // follow href for real pages
      e.preventDefault();
      
      // Save the current section to localStorage
      localStorage.setItem('adminActiveSection', section);
      console.log('Saved section to localStorage:', section);
      
      // Update UI and load section content
      activateSection(section);
    });
  });
}

// Activate a specific section
function activateSection(section) {
  console.log('Activating section:', section);
  
  // Update active state in sidebar
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const activeLink = document.querySelector(`.nav-link[data-section="${section}"]`);
  if (activeLink) activeLink.classList.add('active');
  
  // Switch the visible section
  switchSection(section);
  
  // Load section-specific data
  if (section === 'dashboard') {
    // Only render immediately if Firebase is already ready (e.g. user navigated away and back).
    // On initial page load _statsInitialized is false — watchFoundItemsStats() will call
    // renderRecentItemsWithoutActions() once the first snapshot fires.
    if (_statsInitialized) renderRecentItemsWithoutActions();
  }
  else if (section === 'users') { 
    renderUsers(); 
  }
  else if (section === 'items') { 
    renderAllItems(); 
  }
  else if (section === 'archived') {
    renderArchivedItems();
  }
  else if (section === 'inbox') {
    // Force a fresh reload of inbox data with no caching
    forceRefreshInbox(); 
  }
}

// Switch section
function switchSection(section) {
  const views = document.querySelectorAll('.section-view');
  views.forEach(v => v.style.display = 'none');
  const target = document.getElementById('section-' + section);
  if (target) target.style.display = '';

  const titleMap = { dashboard: 'Dashboard', users: 'Users', items: 'Found Items', inbox: 'Inbox', claims: 'Claims', 'add-item': 'Add Item', 'lost-items': 'Lost Items', archived: 'Archived Items' };
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = titleMap[section] || 'Dashboard';

  if (section === 'lost-items' || section === 'archived') initAdminLostItems();
}

// ── Admin Lost Items ──────────────────────────────────────────────────────────
let _lostItemsUnsub = null;
let _lostItemsCurrent = [];
let _lostItemsServerReady = false; // true once first non-cache snapshot arrives
let _lostItemModalId = null;
let _lostItemCurrentData = null;

function _applyLostItems(items) {
  _lostItemsCurrent = items;
  _lostItemsServerReady = true;
  _renderAdminLostItems();
  const activeCount  = items.filter(i => (i.status || 'active') === 'active').length;
  const pendingCount = items.filter(i => i.status === 'pending').length;
  const activeLostEl = document.getElementById('statActiveLost');
  if (activeLostEl) activeLostEl.textContent = activeCount;
  updateItemCountStats(); // lost reports count toward both cards
  if (document.querySelector('.nav-link.active')?.getAttribute('data-section') === 'archived') renderArchivedItems();
  const badge = document.getElementById('pendingLostBadge');
  if (badge) { badge.textContent = pendingCount; badge.style.display = pendingCount > 0 ? '' : 'none'; }
}

function initAdminLostItems() {
  if (_lostItemsUnsub) return; // already listening

  // Restore from localStorage immediately so items appear before Firestore responds
  try {
    const saved = localStorage.getItem('_adminLostCache');
    if (saved) _applyLostItems(JSON.parse(saved));
  } catch(e) {}

  let retries = 40;
  let prevPendingCount = null; // null = first load, don't toast
  function tryWatch() {
    try {
      if (!window.firebase || !firebase.apps || !firebase.apps.length) throw new Error('not ready');
      const db = firebase.firestore();
      _lostItemsUnsub = db.collection('lostItems')
        .orderBy('postedAt', 'desc')
        .onSnapshot({ includeMetadataChanges: true }, snap => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          _applyLostItems(items);

          // Persist to localStorage after server snapshot so next load is instant
          if (!snap.metadata.fromCache) {
            try { localStorage.setItem('_adminLostCache', JSON.stringify(items)); } catch(e) {}
            // Toast for new pending items
            const pendingCount = items.filter(i => i.status === 'pending').length;
            if (prevPendingCount !== null && pendingCount > prevPendingCount) {
              const added = pendingCount - prevPendingCount;
              showAdminToast(
                `${added} new lost item report${added > 1 ? 's' : ''} pending approval`,
                'lost-items'
              );
            }
            prevPendingCount = pendingCount;
          }

          if (_statsInitialized && !snap.metadata.fromCache) renderRecentItemsWithoutActions();
          if (_cachedFoundItems) updateStatTrends(_cachedFoundItems, _lostItemsCurrent);
        }, () => {
          _lostItemsUnsub = null; // allow retry
          if (retries-- > 0) setTimeout(tryWatch, 2000);
        });
      document.getElementById('lostItemStatusFilter')?.addEventListener('change', _renderAdminLostItems);
    } catch (e) {
      if (retries-- > 0) setTimeout(tryWatch, 300);
    }
  }
  tryWatch();
}

function _renderAdminLostItems() {
  const container = document.getElementById('lostItemsAdminContainer');
  if (!container) return;
  const filter = document.getElementById('lostItemStatusFilter')?.value || 'all';
  const items = filter === 'all' ? _lostItemsCurrent : _lostItemsCurrent.filter(i => i.status === filter);

  if (items.length === 0) {
    clearPager(container);
    container.innerHTML = _lostItemsServerReady
      ? '<div style="text-align:center;padding:2rem;color:#6b7280;">No lost items found.</div>'
      : '<div style="text-align:center;padding:2rem;color:#6b7280;">Loading items…</div>';
    return;
  }

  const rows = applyPagination('lost:' + filter, items, container, _renderAdminLostItems);

  container.innerHTML = rows.map(item => {
    const isPending   = item.status === 'pending';
    const isDeclined  = item.status === 'declined';
    const isArchived  = item.status === 'archived';
    const isPendingEdit = isPending && (item.isEdited || item.updatedAt);
    const statusColor = item.status === 'resolved' ? '#10b981'
                      : isPendingEdit ? '#7c3aed'
                      : isPending   ? '#dc2626'
                      : isDeclined  ? '#64748b'
                      : isArchived  ? '#94a3b8'
                      : '#f59e0b';
    const statusLabel = isPendingEdit ? 'Pending Edit'
                      : isPending  ? 'Pending'
                      : isDeclined ? 'Declined'
                      : isArchived ? 'Archived'
                      : (item.status || 'active');
    const thumb = item.image
      ? `<img src="${item.image}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;">`
      : `<div style="width:40px;height:40px;background:#f1f5f9;border-radius:6px;flex-shrink:0;"></div>`;
    return `
      <div class="table-row" style="grid-template-columns:2fr 1fr 1.5fr 1fr 1.2fr 100px 120px;cursor:pointer;" onclick="window._openLostItemModal('${item.id}')">
        <div class="li-name" style="display:flex;align-items:center;gap:0.75rem;">${thumb}<span style="font-weight:500;">${item.title || '—'}</span></div>
        <div class="li-cat" style="color:#64748b;">${item.category || '—'}</div>
        <div class="li-loc" style="color:#64748b;">${item.lastLocation || '—'}</div>
        <div class="li-date" style="color:#64748b;">${item.dateLost || '—'}</div>
        <div class="li-user" style="color:#64748b;">${item.userName || item.userEmail || '—'}</div>
        <div class="li-status"><span style="background:${statusColor}22;color:${statusColor};padding:2px 10px;border-radius:99px;font-size:0.78rem;font-weight:600;text-transform:capitalize;">${statusLabel}</span></div>
        <div onclick="event.stopPropagation()" class="action-buttons">
          ${isPending ? `<button class="btn-icon" title="Approve" style="color:#10b981;" onclick="window._lostItemAdminApproveId('${item.id}')"><i data-lucide="check-circle" width="16" height="16"></i></button>` : ''}
          <button class="btn-icon" title="View" onclick="window._openLostItemModal('${item.id}')"><i data-lucide="eye" width="16" height="16"></i></button>
          ${item.userId ? `<button class="btn-icon" title="Chat with user" style="color:#059669;" onclick="window._adminChatWithUser('${item.userId}','${(item.userName||item.userEmail||'User').replace(/'/g,"\\'")}','${item.id}')"><i data-lucide="message-circle" width="16" height="16"></i></button>` : ''}
          <button class="btn-icon delete" title="Delete" onclick="window._lostItemAdminDeleteId('${item.id}')"><i data-lucide="trash-2" width="16" height="16"></i></button>
        </div>
      </div>`;
  }).join('');

  if (window.lucide?.createIcons) lucide.createIcons();
}

window._openLostItemModal = function(id) {
  const cached = _lostItemsCurrent.find(i => i.id === id);
  if (cached) { _showLostItemModal(cached); return; }
  firebase.firestore().collection('lostItems').doc(id).get()
    .then(doc => { if (doc.exists) _showLostItemModal({ id: doc.id, ...doc.data() }); });
};

function _showLostItemModal(item) {
  if (typeof addItemModalStyles === 'function') addItemModalStyles();
  _lostItemModalId    = item.id;
  _lostItemCurrentData = item;

  // Reset to view mode
  document.getElementById('liamEditForm').style.display    = 'none';
  document.getElementById('liamDetailRows').style.display  = '';
  const descSection = document.querySelector('#lostItemAdminModal .item-detail-section');
  if (descSection) descSection.style.display = '';
  document.getElementById('liamViewActions').style.display = 'flex';
  document.getElementById('liamEditActions').style.display = 'none';
  const saveBtn = document.getElementById('liamSaveBtn');
  if (saveBtn) { saveBtn.textContent = 'Save Changes'; saveBtn.disabled = false; }

  document.getElementById('liamTitle').textContent    = item.title || 'Lost Item';
  document.getElementById('liamCategory').textContent = item.category || '—';
  document.getElementById('liamLocation').textContent = item.lastLocation || '—';
  document.getElementById('liamDate').textContent     = formatDate(item.dateLost);
  document.getElementById('liamContact').textContent  = item.contactNumber || '—';
  document.getElementById('liamPostedBy').textContent = (item.userName || '') + (item.userEmail ? ' (' + item.userEmail + ')' : '');
  document.getElementById('liamStatus').textContent   = item.status || 'active';
  document.getElementById('liamDesc').textContent     = item.description || '—';

  // Badge: PENDING EDIT / PENDING / DECLINED / LOST
  const isPendingEdit = item.status === 'pending' && (item.isEdited || item.updatedAt);
  const badge = document.getElementById('liamTypeBadge');
  if (badge) {
    if (isPendingEdit) {
      badge.textContent = 'PENDING EDIT';
      badge.style.background = '#ede9fe';
      badge.style.color = '#6d28d9';
    } else if (item.status === 'pending') {
      badge.textContent = 'PENDING APPROVAL';
      badge.style.background = '#fef3c7';
      badge.style.color = '#92400e';
    } else if (item.status === 'declined') {
      badge.textContent = 'DECLINED';
      badge.style.background = '#f1f5f9';
      badge.style.color = '#475569';
    } else {
      badge.textContent = 'LOST';
      badge.style.background = '#fef3c7';
      badge.style.color = '#b45309';
    }
  }

  // Edit diff banner
  let editNotice = document.getElementById('liamEditNotice');
  if (isPendingEdit) {
    const prev = item.previousData || {};
    const fields = [
      { label: 'Item Name',      oldVal: prev.title,         newVal: item.title },
      { label: 'Category',       oldVal: prev.category,      newVal: item.category },
      { label: 'Description',    oldVal: prev.description,   newVal: item.description },
      { label: 'Last Location',  oldVal: prev.lastLocation,  newVal: item.lastLocation },
      { label: 'Date Lost',      oldVal: prev.dateLost,      newVal: item.dateLost },
      { label: 'Contact Number', oldVal: prev.contactNumber, newVal: item.contactNumber },
    ];
    const changed = fields.filter(f => f.oldVal !== undefined && f.oldVal !== f.newVal);
    let diffHtml = '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.6rem;"><span style="font-size:1rem;">✏️</span><strong style="color:#5b21b6;">User submitted edits — review changes below:</strong></div>';
    if (changed.length > 0) {
      diffHtml += '<table style="width:100%;border-collapse:collapse;font-size:0.8rem;">';
      diffHtml += '<tr><th style="text-align:left;padding:3px 6px;color:#7c3aed;font-weight:600;width:110px;">Field</th><th style="text-align:left;padding:3px 6px;color:#dc2626;font-weight:600;">Before</th><th style="text-align:left;padding:3px 6px;color:#16a34a;font-weight:600;">After</th></tr>';
      changed.forEach(f => {
        diffHtml += `<tr>
          <td style="padding:3px 6px;font-weight:500;color:#6d28d9;vertical-align:top;">${f.label}</td>
          <td style="padding:3px 6px;color:#dc2626;background:#fef2f2;border-radius:3px;vertical-align:top;">${f.oldVal || '—'}</td>
          <td style="padding:3px 6px;color:#16a34a;background:#f0fdf4;border-radius:3px;vertical-align:top;">${f.newVal || '—'}</td>
        </tr>`;
      });
      diffHtml += '</table>';
    } else if (Object.keys(prev).length === 0) {
      diffHtml += '<div style="color:#7c3aed;font-size:0.8rem;">The user updated this report. No field-by-field diff available for older edits.</div>';
    } else {
      const photoChanged = prev.image !== undefined && (
        prev.image !== (item.image || '') ||
        (prev.images || '[]') !== JSON.stringify(item.images || [])
      );
      if (photoChanged) {
        diffHtml += '<div style="color:#7c3aed;font-size:0.8rem;">Only photos were changed.</div>';
      } else {
        diffHtml += '<div style="color:#7c3aed;font-size:0.8rem;">No changes were made.</div>';
      }
    }

    if (!editNotice) {
      editNotice = document.createElement('div');
      editNotice.id = 'liamEditNotice';
      editNotice.style.cssText = 'background:#ede9fe;border:1px solid #c4b5fd;border-radius:8px;padding:0.75rem 1rem;margin-bottom:0.75rem;';
      const descSection = document.querySelector('#lostItemAdminModal .item-detail-section');
      if (descSection) descSection.parentNode.insertBefore(editNotice, descSection);
    }
    editNotice.innerHTML = diffHtml;
    editNotice.style.display = 'block';
  } else {
    if (editNotice) editNotice.style.display = 'none';
  }

  // Show / hide "Deleted by user" row for archived items
  let archivedByRow = document.getElementById('liamArchivedByRow');
  if (!archivedByRow) {
    archivedByRow = document.createElement('div');
    archivedByRow.id = 'liamArchivedByRow';
    archivedByRow.className = 'item-detail-row';
    archivedByRow.innerHTML = `
      <span class="item-detail-label" style="color:#64748b;">Deleted by:</span>
      <span class="item-detail-value" id="liamArchivedByText" style="color:#64748b;"></span>`;
    const statusRow = document.getElementById('liamStatus')?.closest('.item-detail-row');
    if (statusRow) statusRow.insertAdjacentElement('afterend', archivedByRow);
  }
  if (item.status === 'archived') {
    let who;
    if (item.archivedByAdmin) {
      who = `Admin (${item.archivedByAdminName || 'Administrator'})`;
    } else if (item.archivedByUser) {
      const name  = item.archivedByName  || item.userName  || '';
      const email = item.archivedByEmail || item.userEmail || '';
      who = name
        ? `${name}${email ? ' (' + email + ')' : ''}`
        : email || 'User';
    }
    if (who) {
      document.getElementById('liamArchivedByText').textContent = who;
      archivedByRow.style.display = '';
    } else {
      archivedByRow.style.display = 'none';
    }
  } else {
    archivedByRow.style.display = 'none';
  }

  // Show decline reason in modal if present
  const reasonRow = document.getElementById('liamDeclineReasonRow');
  if (reasonRow) {
    if (item.status === 'declined' && item.declineReason) {
      reasonRow.style.display = '';
      const reasonEl = document.getElementById('liamDeclineReasonText');
      if (reasonEl) reasonEl.textContent = item.declineReason;
    } else {
      reasonRow.style.display = 'none';
    }
  }

  // Show/hide Approve, Decline, and Resolve buttons based on status
  const approveBtn = document.getElementById('liamApproveBtn');
  const declineBtn = document.getElementById('liamDeclineBtn');
  const resolveBtn = document.getElementById('liamResolveBtn');
  const editBtn    = document.getElementById('liamEditBtn');
  // Always reset the decline panel when opening modal
  const declinePanel  = document.getElementById('liamDeclinePanel');
  const declineReason = document.getElementById('liamDeclineReason');
  if (declinePanel)  declinePanel.style.display  = 'none';
  if (declineReason) declineReason.value         = '';

  // Manage Restore button for archived items
  let restoreBtn = document.getElementById('liamRestoreBtn');
  if (!restoreBtn) {
    restoreBtn = document.createElement('button');
    restoreBtn.id = 'liamRestoreBtn';
    restoreBtn.textContent = '↩ Restore';
    restoreBtn.style.cssText = 'padding:0.5rem 1.25rem;background:#1a2e6b;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500;';
    restoreBtn.onclick = () => {
      firebase.firestore().collection('lostItems').doc(_lostItemModalId).update({
        status: 'active',
        archivedByUser:      firebase.firestore.FieldValue.delete(),
        archivedByName:      firebase.firestore.FieldValue.delete(),
        archivedByEmail:     firebase.firestore.FieldValue.delete(),
        archivedByAdmin:     firebase.firestore.FieldValue.delete(),
        archivedByAdminName: firebase.firestore.FieldValue.delete(),
        archivedAt:          firebase.firestore.FieldValue.delete()
      }).catch(() => {});
      document.getElementById('lostItemAdminModal').style.display = 'none';
    };
    approveBtn?.parentNode.appendChild(restoreBtn);
  }

  if (item.status === 'archived') {
    if (approveBtn) approveBtn.style.display = 'none';
    if (declineBtn) declineBtn.style.display = 'none';
    if (resolveBtn) resolveBtn.style.display = 'none';
    if (editBtn)    editBtn.style.display    = 'none';
    restoreBtn.style.display = '';
  } else if (item.status === 'pending') {
    if (approveBtn) approveBtn.style.display = '';
    if (declineBtn) declineBtn.style.display = '';
    if (resolveBtn) resolveBtn.style.display = 'none';
    if (editBtn)    editBtn.style.display    = 'none';
    restoreBtn.style.display = 'none';
  } else {
    if (approveBtn) approveBtn.style.display = 'none';
    if (declineBtn) declineBtn.style.display = 'none';
    if (resolveBtn) {
      resolveBtn.style.display = '';
      resolveBtn.textContent = item.status === 'resolved' ? 'Mark as Active' : 'Mark as Resolved';
    }
    if (editBtn) editBtn.style.display = '';
    restoreBtn.style.display = 'none';
  }

  const img   = document.getElementById('liamImage');
  const noImg = document.getElementById('liamNoImg');
  if (item.image) {
    img.src = item.image;
    img.style.display = '';
    if (noImg) noImg.style.display = 'none';
  } else {
    img.style.display = 'none';
    if (noImg) noImg.style.display = 'flex';
  }

  document.getElementById('lostItemAdminModal').style.display = 'flex';
}

window._lostItemAdminEdit = function() {
  if (!_lostItemCurrentData) return;
  const item = _lostItemCurrentData;

  // Populate edit fields
  document.getElementById('liamEditTitle').value    = item.title || '';
  document.getElementById('liamEditDesc').value     = item.description || '';
  document.getElementById('liamEditCategory').value = item.category || '';
  document.getElementById('liamEditLocation').value = item.lastLocation || '';
  document.getElementById('liamEditDate').value     = item.dateLost || '';
  document.getElementById('liamEditContact').value  = item.contactNumber || '';

  // Switch to edit mode
  const descSection = document.querySelector('#lostItemAdminModal .item-detail-section');
  if (descSection) descSection.style.display = 'none';
  document.getElementById('liamDetailRows').style.display  = 'none';
  document.getElementById('liamEditForm').style.display    = 'flex';
  document.getElementById('liamViewActions').style.display = 'none';
  document.getElementById('liamEditActions').style.display = 'flex';
  document.getElementById('liamEditTitle').focus();
};

window._lostItemAdminCancelEdit = function() {
  if (_lostItemCurrentData) _showLostItemModal(_lostItemCurrentData);
};

window._lostItemAdminSaveEdit = function() {
  if (!_lostItemModalId) return;
  const updates = {
    title:         document.getElementById('liamEditTitle').value.trim(),
    description:   document.getElementById('liamEditDesc').value.trim(),
    category:      document.getElementById('liamEditCategory').value.trim(),
    lastLocation:  document.getElementById('liamEditLocation').value.trim(),
    dateLost:      document.getElementById('liamEditDate').value,
    contactNumber: document.getElementById('liamEditContact').value.trim(),
    updatedAt:     firebase.firestore.FieldValue.serverTimestamp()
  };
  if (!updates.title) { alert('Title is required.'); return; }

  const saveBtn = document.getElementById('liamSaveBtn');
  if (saveBtn) { saveBtn.textContent = 'Saving…'; saveBtn.disabled = true; }

  firebase.firestore().collection('lostItems').doc(_lostItemModalId).update(updates)
    .then(() => {
      const idx = _lostItemsCurrent.findIndex(i => i.id === _lostItemModalId);
      if (idx !== -1) _lostItemsCurrent[idx] = { ..._lostItemsCurrent[idx], ...updates };
      _showLostItemModal({ ..._lostItemCurrentData, ...updates });
    })
    .catch(err => {
      alert('Failed to save: ' + err.message);
      if (saveBtn) { saveBtn.textContent = 'Save Changes'; saveBtn.disabled = false; }
    });
};

function _sendLostItemNotification(item, type) {
  if (!item || !item.userId) return;
  const db = firebase.firestore();
  const declinedMsg = item._declineReason
    ? `Your lost item report "${item.title || 'item'}" was declined. Reason: ${item._declineReason}`
    : `Your lost item report "${item.title || 'item'}" has been declined by the admin.`;
  db.collection('notifications').add({
    userId:        item.userId,
    type:          type,
    title:         item.title || 'Your item',
    lostItemId:    item.id || null,
    declineReason: item._declineReason || null,
    message:       type === 'lost_approved'
                     ? `Your lost item report "${item.title || 'item'}" has been approved and is now visible to everyone.`
                     : declinedMsg,
    read:          false,
    createdAt:     firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});
}

window._lostItemAdminApprove = function() {
  if (!_lostItemModalId) return;
  const item = _lostItemsCurrent.find(i => i.id === _lostItemModalId);
  firebase.firestore().collection('lostItems').doc(_lostItemModalId)
    .update({ status: 'active', isEdited: firebase.firestore.FieldValue.delete() }).catch(() => {});
  if (item) _sendLostItemNotification(item, 'lost_approved');
  document.getElementById('lostItemAdminModal').style.display = 'none';
};

window._lostItemAdminShowDecline = function() {
  const panel = document.getElementById('liamDeclinePanel');
  if (panel) { panel.style.display = 'flex'; }
  const reason = document.getElementById('liamDeclineReason');
  if (reason) { reason.value = ''; reason.focus(); }
};

window._lostItemAdminHideDecline = function() {
  const panel  = document.getElementById('liamDeclinePanel');
  const reason = document.getElementById('liamDeclineReason');
  if (panel)  panel.style.display = 'none';
  if (reason) reason.value = '';
};

window._lostItemAdminConfirmDecline = function() {
  if (!_lostItemModalId) return;
  const reason = (document.getElementById('liamDeclineReason')?.value || '').trim();
  if (!reason) {
    alert('Please enter a reason for declining.');
    return;
  }
  const item = _lostItemsCurrent.find(i => i.id === _lostItemModalId);
  const isPendingEdit = item && item.status === 'pending' && (item.isEdited || item.updatedAt);
  const db = firebase.firestore();

  if (isPendingEdit) {
    // Declining an edit — restore previous data and keep the item active
    const prev = item.previousData || {};
    const restoreFields = {};
    if (prev.title)         restoreFields.title         = prev.title;
    if (prev.category)      restoreFields.category      = prev.category;
    if (prev.description)   restoreFields.description   = prev.description;
    if (prev.lastLocation)  restoreFields.lastLocation  = prev.lastLocation;
    if (prev.dateLost)      restoreFields.dateLost      = prev.dateLost;
    if (prev.contactNumber) restoreFields.contactNumber = prev.contactNumber;
    if (prev.image)         restoreFields.image         = prev.image;
    if (prev.images)        restoreFields.additionalImages = JSON.parse(prev.images || '[]');
    db.collection('lostItems').doc(_lostItemModalId).update({
      ...restoreFields,
      status: 'active',
      isEdited: firebase.firestore.FieldValue.delete(),
      previousData: firebase.firestore.FieldValue.delete(),
      updatedAt: firebase.firestore.FieldValue.delete(),
      editDeclineReason: reason
    }).catch(() => {});
    // Notify user that their edit was declined but the original report remains active
    if (item) {
      db.collection('notifications').add({
        userId:    item.userId,
        type:      'lost_edit_declined',
        title:     item.title || 'Your item',
        lostItemId: item.id || null,
        declineReason: reason,
        message:   `Your edit to "${item.title || 'your report'}" was declined. Reason: ${reason}. Your original report remains active.`,
        read:      false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    }
  } else {
    // Declining a brand-new submission — set to declined as normal
    db.collection('lostItems').doc(_lostItemModalId)
      .update({ status: 'declined', declineReason: reason }).catch(() => {});
    if (item) _sendLostItemNotification({ ...item, _declineReason: reason }, 'lost_declined');
  }
  window._lostItemAdminHideDecline();
  document.getElementById('lostItemAdminModal').style.display = 'none';
};

window._lostItemAdminApproveId = function(id) {
  if (!confirm('Approve this lost item? It will become visible to all users.')) return;
  const item = _lostItemsCurrent.find(i => i.id === id);
  firebase.firestore().collection('lostItems').doc(id)
    .update({ status: 'active', isEdited: firebase.firestore.FieldValue.delete() }).catch(() => {});
  if (item) _sendLostItemNotification(item, 'lost_approved');
};

window._lostItemAdminResolve = function() {
  if (!_lostItemModalId) return;
  const item = _lostItemsCurrent.find(i => i.id === _lostItemModalId);
  const newStatus = item?.status === 'resolved' ? 'active' : 'resolved';
  firebase.firestore().collection('lostItems').doc(_lostItemModalId).update({ status: newStatus }).catch(() => {});
  document.getElementById('lostItemAdminModal').style.display = 'none';
};

window._lostItemAdminDelete = function() {
  if (!_lostItemModalId) return;
  if (!confirm('Delete this lost item report? It will be archived and can be reviewed later.')) return;
  const item = _lostItemsCurrent.find(i => i.id === _lostItemModalId);
  const adminName = localStorage.getItem('adminName') || 'Admin';
  firebase.firestore().collection('lostItems').doc(_lostItemModalId).update({
    status: 'archived',
    archivedByAdmin: true,
    archivedByAdminName: adminName,
    archivedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});
  if (item && item.status === 'pending') _sendLostItemNotification(item, 'lost_declined');
  document.getElementById('lostItemAdminModal').style.display = 'none';
};

window._lostItemAdminDeleteId = function(id) {
  if (!confirm('Delete this lost item report? It will be archived and can be reviewed later.')) return;
  const item = _lostItemsCurrent.find(i => i.id === id);
  const adminName = localStorage.getItem('adminName') || 'Admin';
  firebase.firestore().collection('lostItems').doc(id).update({
    status: 'archived',
    archivedByAdmin: true,
    archivedByAdminName: adminName,
    archivedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});
  if (item && item.status === 'pending') _sendLostItemNotification(item, 'lost_declined');
};

// Open or create a chat specifically about a reported lost item
window._adminChatWithUser = function(userId, userName, lostItemId) {
  const item = _lostItemsCurrent.find(i => i.id === lostItemId);
  if (!item) return;

  // Switch to inbox section first
  const inboxLink = document.querySelector('[data-section="inbox"]');
  if (inboxLink) inboxLink.click();

  setTimeout(() => {
    const db = firebase.firestore();
    // Query all chats for this user, then filter by lostItemId in JS (avoids composite index)
    db.collection('liveChats').where('userId', '==', userId).get()
      .then(snap => {
        const existing = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(d => d.lostItemId === lostItemId)
          .sort((a, b) => {
            const ta = a.lastTimestamp?.toMillis?.() || a.startTime?.toMillis?.() || 0;
            const tb = b.lastTimestamp?.toMillis?.() || b.startTime?.toMillis?.() || 0;
            return tb - ta;
          });

        if (existing.length > 0) {
          // Resume existing chat for this lost item
          if (typeof selectChat === 'function') selectChat(existing[0].id);
          return;
        }

        // Create a new chat thread about this specific lost item
        // userHidden:true keeps it invisible to the user until the admin sends a real message
        const chatId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        db.collection('liveChats').doc(chatId).set({
          userId:        userId,
          userName:      item.userName  || userName,
          userEmail:     item.userEmail || '',
          lostItemId:    lostItemId,
          lostItemTitle: item.title || 'Lost Item',
          itemTitle:     item.title || 'Lost Item', // shown in user's inbox
          adminInitiated: true,
          active:        true,
          userHidden:    true,
          startTime:     firebase.firestore.FieldValue.serverTimestamp(),
          lastMessage:   '',
          lastSender:    'admin',
          lastTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
          unreadCount:   0
        }).then(() => {
          setTimeout(() => {
            if (typeof selectChat === 'function') selectChat(chatId);
          }, 500);
        });
      })
      .catch(() => alert('Could not open chat for ' + userName + '.'));
  }, 600);
};

// Close lost item modal on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('lostItemAdminModal');
    if (modal && modal.style.display !== 'none') modal.style.display = 'none';
  }
});
// ─────────────────────────────────────────────────────────────────────────────

// Render statistics
function renderStats() {
  const safe = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
  // Don't reset to '...' — only do so on very first call when element still shows placeholder
  const totalEl = document.getElementById('statTotalItems');
  if (totalEl && totalEl.textContent === '') safe('statTotalItems', '...');

  if (!window.firebase || !firebase.apps || !firebase.apps.length) {
    setTimeout(renderStats, 300);
    return;
  }
  firebase.firestore().collection('items').get().then(snap => {
    updateStats(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }).catch(() => {
    const items = window.DataStore?.getItemsSync?.() || [];
    updateStats(items);
  });
}

// Update statistics (statClaimed is kept live by watchClaimedResolvedCount)
function updateStats(items) {
  const total   = items.filter(isNotArchived).length + _lostItemsCurrent.filter(isNotArchived).length;
  const pending = items.filter(i => i.status === 'active').length;

  const safe = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
  safe('statTotalItems', total);
  safe('statActive', pending);
  // Don't touch statClaimed here — watchClaimedResolvedCount owns it
}

// Tracks whether the first Firestore snapshot has fired (Firebase is ready)
let _statsInitialized = false;
// Cache of found items from the watchFoundItemsStats snapshot (avoids extra .get() calls)
let _cachedFoundItems = null;

// ── Pagination ───────────────────────────────────────────────────────────────
// Shared 10-per-page pager for the admin list sections. Each list passes its own
// key so the page it is on survives the live snapshots that re-render it.
const PAGE_SIZE = 10;
const _pageByKey = {};

// Returns the slice of `items` belonging to the current page and (re)draws the
// pager under `container`. `rerender` is called when another page is picked.
function applyPagination(key, items, container, rerender) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page  = Math.min(Math.max(_pageByKey[key] || 1, 1), totalPages); // clamp: the list may have shrunk
  _pageByKey[key] = page;
  const start = (page - 1) * PAGE_SIZE;
  const slice = items.slice(start, start + PAGE_SIZE);
  _renderPager(key, container, { page, totalPages, start, shown: slice.length, total: items.length }, rerender);
  return slice;
}

// Send a list back to page 1 — used when its result set changes wholesale.
function resetPage(key) { _pageByKey[key] = 1; }

// Drop a list's pager — for early-return paths that draw their own empty state.
function clearPager(container) {
  const pager = container && document.getElementById(container.id + '__pager');
  if (pager) pager.innerHTML = '';
}


function _renderPager(key, container, info, rerender) {
  const host = container.closest('.items-table') || container;
  const id   = container.id + '__pager';
  let pager  = document.getElementById(id);
  if (!pager) {
    pager = document.createElement('div');
    pager.id = id;
    pager.className = 'table-pager';
    host.insertAdjacentElement('afterend', pager);
  }
  if (info.total <= PAGE_SIZE) { pager.innerHTML = ''; return; } // single page — no controls

  // Window the numbers so a long list doesn't produce a wall of buttons
  const first = Math.max(1, Math.min(info.page - 2, info.totalPages - 4));
  const last  = Math.min(info.totalPages, first + 4);
  const nums  = [];
  for (let p = first; p <= last; p++) nums.push(p);

  pager.innerHTML = `
    <span class="pager-info">Showing ${info.start + 1}&ndash;${info.start + info.shown} of ${info.total}</span>
    <div class="pager-controls">
      <button class="pager-btn" data-page="${info.page - 1}" ${info.page === 1 ? 'disabled' : ''}>&lsaquo; Prev</button>
      ${first > 1 ? `<button class="pager-btn" data-page="1">1</button><span class="pager-gap">&hellip;</span>` : ''}
      ${nums.map(p => `<button class="pager-btn${p === info.page ? ' active' : ''}" data-page="${p}">${p}</button>`).join('')}
      ${last < info.totalPages ? `<span class="pager-gap">&hellip;</span><button class="pager-btn" data-page="${info.totalPages}">${info.totalPages}</button>` : ''}
      <button class="pager-btn" data-page="${info.page + 1}" ${info.page === info.totalPages ? 'disabled' : ''}>Next &rsaquo;</button>
    </div>`;

  pager.querySelectorAll('.pager-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page, 10);
      if (!p || p === info.page || p < 1 || p > info.totalPages) return;
      _pageByKey[key] = p;
      rerender();
      host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// users.js lives in its own IIFE and needs these
window.applyPagination = applyPagination;
window.resetPage       = resetPage;
window.clearPager      = clearPager;

// Archived items (found or lost) are deleted records — excluded from every count.
const isNotArchived = i => i.status !== 'archived';

// Total Items = non-archived found items + non-archived lost reports, so the card
// matches the combined list the "all" filter renders. Archived Items is the same
// pool inverted. Called from both collection watchers.
function updateItemCountStats() {
  if (_cachedFoundItems === null) return; // found items haven't loaded yet

  const total = document.getElementById('statTotalItems');
  if (total) total.textContent = String(
    _cachedFoundItems.filter(isNotArchived).length + _lostItemsCurrent.filter(isNotArchived).length);

  const archived = document.getElementById('statArchived');
  if (archived) archived.textContent = String(
    _cachedFoundItems.filter(i => i.status === 'archived').length +
    _lostItemsCurrent.filter(i => i.status === 'archived').length);
}


// Real-time watcher for Total Items + Active Found Items stats and recent table
function watchFoundItemsStats() {
  // Restore from localStorage immediately so Found Items renders before Firestore responds
  try {
    const saved = localStorage.getItem('_adminFoundCache');
    if (saved) {
      _cachedFoundItems = JSON.parse(saved);
      const safe = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
      updateItemCountStats();
      safe('statActive', _cachedFoundItems.filter(i => i.status === 'active').length);
      const activeNav = document.querySelector('.nav-link.active');
      if (activeNav && activeNav.getAttribute('data-section') === 'items') renderAllItems();
      if (activeNav && activeNav.getAttribute('data-section') === 'archived') renderArchivedItems();
    }
  } catch(e) {}

  let retries = 40;
  function tryWatch() {
    try {
      if (!window.firebase || !firebase.apps || !firebase.apps.length) throw new Error('not ready');
      firebase.firestore().collection('items').onSnapshot({ includeMetadataChanges: true }, snap => {
        const safe = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
        _cachedFoundItems = snap.docs.map(d => ({ id: d.id, _type: 'found', ...d.data() }));
        updateItemCountStats();
        safe('statActive', snap.docs.filter(d => d.data().status === 'active').length);
        const _activeNav = document.querySelector('.nav-link.active');
        if (_activeNav && _activeNav.getAttribute('data-section') === 'items') renderAllItems();
        if (_activeNav && _activeNav.getAttribute('data-section') === 'archived') renderArchivedItems();
        if (snap.metadata.fromCache) return; // defer stats/trends update until server confirms
        _statsInitialized = true;
        renderRecentItemsWithoutActions();
        updateStatTrends(_cachedFoundItems, _lostItemsCurrent);
        // Save to localStorage so next load is instant
        try { localStorage.setItem('_adminFoundCache', JSON.stringify(_cachedFoundItems)); } catch(e) {}
      }, () => {
        if (retries-- > 0) setTimeout(tryWatch, 2000);
      });
    } catch (e) {
      if (retries-- > 0) setTimeout(tryWatch, 300);
    }
  }
  tryWatch();
}

// Both watchActiveLostCount and watchPendingLostCount are merged into initAdminLostItems.

function showAdminToast(message, section) {
  const toast = document.createElement('div');
  toast.style.cssText = [
    'position:fixed', 'bottom:24px', 'right:24px',
    'background:#1a2e6b', 'color:#fff',
    'padding:14px 20px', 'border-radius:10px',
    'box-shadow:0 4px 16px rgba(0,0,0,0.2)',
    'z-index:99999', 'display:flex', 'align-items:center', 'gap:12px',
    'font-size:0.93rem', 'max-width:340px', 'cursor:pointer',
    'border-left:4px solid #f07316'
  ].join(';');
  toast.innerHTML = `
    <span style="font-size:1.3rem;">🔍</span>
    <div style="flex:1;">
      <div style="font-weight:700; margin-bottom:2px;">Lost Item Alert</div>
      <div style="opacity:0.9;">${message}</div>
    </div>
    <span style="opacity:0.6; font-size:1.1rem; line-height:1; cursor:pointer;" onclick="this.parentElement.remove()">×</span>`;
  toast.addEventListener('click', function(e) {
    if (e.target.tagName === 'SPAN' && e.target.style.cursor === 'pointer') return;
    if (section) {
      const link = document.querySelector(`.nav-link[data-section="${section}"]`);
      if (link) link.click();
    }
    toast.remove();
  });
  document.body.appendChild(toast);
  // Auto-dismiss after 8 seconds
  setTimeout(() => { if (toast.isConnected) toast.remove(); }, 8000);
}

// Live counter for claimed found items + resolved lost items combined
function watchClaimedResolvedCount() {
  let retries = 40;
  let foundClaimed = 0;
  let lostResolved = 0;

  const setEl = v => {
    const el = document.getElementById('statClaimed');
    if (el) el.textContent = String(v);
  };
  const update = () => setEl(foundClaimed + lostResolved);

  function tryWatch() {
    try {
      if (!window.firebase || !firebase.apps || !firebase.apps.length) throw new Error('not ready');
      const db = firebase.firestore();

      // Immediate one-time fetch so the count shows without waiting for socket
      Promise.all([
        db.collection('items').where('status', '==', 'claimed').get(),
        db.collection('lostItems').where('status', '==', 'resolved').get()
      ]).then(([foundSnap, lostSnap]) => {
        foundClaimed = foundSnap.size;
        lostResolved = lostSnap.size;
        update();
      }).catch(() => setEl(0));

      // Real-time listeners for live updates
      db.collection('items').where('status', '==', 'claimed')
        .onSnapshot(snap => {
          foundClaimed = snap.size; update();
          // Refresh the delta pill using the live claimed docs + cached found items
          if (_cachedFoundItems) {
            const claimedDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Merge into cachedFoundItems so updateStatTrends sees latest updatedAt
            const merged = _cachedFoundItems.map(item => {
              const live = claimedDocs.find(d => d.id === item.id);
              return live ? { ...item, ...live } : item;
            });
            updateStatTrends(merged, _lostItemsCurrent);
          }
        },
        ()   => { db.collection('items').where('status','==','claimed').get()
                    .then(s => { foundClaimed = s.size; update(); }).catch(() => {}); });

      db.collection('lostItems').where('status', '==', 'resolved')
        .onSnapshot(snap => { lostResolved = snap.size; update(); },
                    ()   => { db.collection('lostItems').where('status','==','resolved').get()
                                .then(s => { lostResolved = s.size; update(); }).catch(() => {}); });
    } catch (e) {
      if (retries-- > 0) setTimeout(tryWatch, 300);
      else setEl(0);
    }
  }
  tryWatch();
}

// Format date helper
function formatDate(dateStr) {
  if (!dateStr) return 'Unknown date';
  
  let date;
  if (typeof dateStr === 'string') {
    date = new Date(dateStr);
  } else if (dateStr.toDate && typeof dateStr.toDate === 'function') {
    // Handle Firebase Timestamp
    date = dateStr.toDate();
  } else if (dateStr instanceof Date) {
    date = dateStr;
  } else {
    return 'Invalid date';
  }
  
  // Check if the date is valid
  if (isNaN(date.getTime())) {
    return 'Invalid date';
  }
  
  return date.toLocaleDateString();
}

// Status badge helper
function statusBadge(status) {
  if (status === 'claimed')   return '<span class="status-badge status-completed">Claimed</span>';
  if (status === 'resolved')  return '<span class="status-badge status-completed">Resolved</span>';
  if (status === 'soon')      return '<span class="status-badge status-pending">Disposal Soon</span>';
  if (status === 'archived')  return '<span class="status-badge status-archived">Archived</span>';
  return '<span class="status-badge status-active">Active</span>';
}

// Status dropdown for Items section only
function statusDropdown(currentStatus) {
  const statuses = [
    { value: 'active',   label: 'Active',       class: 'status-active' },
    { value: 'claimed',  label: 'Claimed',       class: 'status-completed' },
    { value: 'soon',     label: 'For Disposal',  class: 'status-pending' },
    { value: 'archived', label: 'Archived',      class: 'status-archived' }
  ];
  
  return `
    <select class="status-select" data-current-status="${currentStatus}">
      ${statuses.map(s => `
        <option value="${s.value}" ${s.value === currentStatus ? 'selected' : ''}>
          ${s.label}
        </option>
      `).join('')}
    </select>
  `;
}

// _applyDashboardFilter — called by stat card clicks
window._applyDashboardFilter = function(filterType) {
  const heading = document.getElementById('recentItemsHeading');
  const titleEl  = document.getElementById('pageTitle');
  const headingMap = { all: 'Recent Items', active: 'Recent Active Found Items', claimed: 'Recent Claimed / Resolved Items', soon: 'Recent Items for Disposal', lost: 'Active Lost Reports', archived: 'Archived Items' };
  const titleMap   = { all: 'Dashboard',    active: 'Active Found Items',        claimed: 'Items Claimed / Resolved',       soon: 'Items for Disposal',         lost: 'Active Lost Items', archived: 'Archived Items' };
  if (heading) heading.textContent = headingMap[filterType] || 'Recent Items';
  if (titleEl)  titleEl.textContent  = titleMap[filterType]  || 'Dashboard';
  renderRecentItemsWithoutActions(filterType);
};

// Render combined found + lost items in the dashboard table
function renderRecentItemsWithoutActions(statusFilter) {
  const container = document.getElementById('recentItemsContainer');
  if (!container) return;

  const needFound = !statusFilter || statusFilter === 'all' || statusFilter === 'active' || statusFilter === 'claimed' || statusFilter === 'soon' || statusFilter === 'archived';
  const needLost  = !statusFilter || statusFilter === 'all' || statusFilter === 'lost' || statusFilter === 'claimed' || statusFilter === 'archived';

  // Use cached data when available — avoids extra Firestore round trips and eliminates the "Loading..." flash
  const foundPromise = needFound
    ? (_cachedFoundItems !== null
        ? Promise.resolve(_cachedFoundItems)  // instant, already has _type:'found'
        : (window.firebase?.apps?.length
            ? firebase.firestore().collection('items').orderBy('date', 'desc').limit(100).get()
                .then(snap => snap.docs.map(d => ({ id: d.id, _type: 'found', ...d.data() })))
            : Promise.resolve([])))
    : Promise.resolve([]);

  const lostPromise = needLost
    ? (_lostItemsUnsub !== null
        ? Promise.resolve(_lostItemsCurrent.map(i => ({ ...i, _type: 'lost' })))  // instant
        : (window.firebase?.apps?.length
            ? firebase.firestore().collection('lostItems').orderBy('postedAt', 'desc').limit(50).get()
                .then(snap => snap.docs.map(d => ({ id: d.id, _type: 'lost', ...d.data() })))
            : Promise.resolve([])))
    : Promise.resolve([]);

  // Only show "Loading..." when neither cache is ready (very first load before any snapshot fires)
  if (_cachedFoundItems === null && _lostItemsUnsub === null) {
    container.innerHTML = '<div class="table-row"><div style="grid-column: 1/-1; text-align: center;">Loading...</div></div>';
  }

  Promise.all([foundPromise, lostPromise]).then(([foundItems, lostItems]) => {
    // The archived card is the one view that shows archived records
    let combined = statusFilter === 'archived'
      ? [...foundItems.filter(i => i.status === 'archived'), ...lostItems.filter(i => i.status === 'archived')]
      : [...foundItems.filter(isNotArchived), ...lostItems.filter(isNotArchived)];


    if (statusFilter === 'active')  combined = combined.filter(i => i._type === 'found' && i.status === 'active');
    else if (statusFilter === 'claimed') combined = combined.filter(i =>
      (i._type === 'found' && i.status === 'claimed') ||
      (i._type === 'lost'  && i.status === 'resolved'));
    else if (statusFilter === 'soon')    combined = combined.filter(i => i._type === 'found' && i.status === 'soon');
    else if (statusFilter === 'lost')    combined = combined.filter(i => i._type === 'lost'  && (i.status || 'active') === 'active');

    combined.sort((a, b) => {
      const ta = a._type === 'found'
        ? (a.date?.toMillis?.() || new Date(a.date || 0).getTime() || 0)
        : (a.postedAt?.toMillis?.() || 0);
      const tb = b._type === 'found'
        ? (b.date?.toMillis?.() || new Date(b.date || 0).getTime() || 0)
        : (b.postedAt?.toMillis?.() || 0);
      return tb - ta;
    });

    // Every filter shows its full result set, 10 rows to a page
    const key  = 'recent:' + (statusFilter || 'all');
    const rows = applyPagination(key, combined, container, () => renderRecentItemsWithoutActions(statusFilter));
    displayReadOnlyRecentItems(rows, container);
  }).catch(err => {
    console.error('Error loading items:', err);
    container.innerHTML = '<div class="table-row"><div style="grid-column: 1/-1; text-align: center;">Error loading items</div></div>';
  });
}

// Display combined found + lost items in the dashboard table
function displayReadOnlyRecentItems(items, container) {
  if (!items.length) {
    container.innerHTML = '<div class="table-row"><div style="grid-column: 1/-1; text-align: center;">No items found.</div></div>';
    return;
  }

  const rowsHTML = items.map(item => {
    const isLost     = item._type === 'lost';
    const location   = isLost ? (item.lastLocation || '') : (item.location || '');
    const dateStr    = isLost ? formatDate(item.dateLost) : formatDate(item.date);
    const imgSrc     = item.image || 'https://via.placeholder.com/400x300?text=No+Image';
    const typeBadge  = isLost
      ? `<span style="background:#fef3c7;color:#b45309;padding:2px 10px;border-radius:99px;font-size:0.7rem;font-weight:700;letter-spacing:0.04em;">LOST</span>`
      : `<span style="background:#dbeafe;color:#1e40af;padding:2px 10px;border-radius:99px;font-size:0.7rem;font-weight:700;letter-spacing:0.04em;">FOUND</span>`;
    const statusHtml = statusBadge(item.status || 'active');

    return `
      <div class="table-row read-only-row" data-id="${item.id}" data-status="${item.status || ''}" data-type="${item._type || 'found'}">
        <div class="item-info" style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 1rem;">
          <img src="${imgSrc}" alt="${item.title || ''}" class="item-image" onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'" style="width:52px;height:52px;object-fit:cover;border-radius:8px;flex-shrink:0;">
          <div class="item-text-col" style="flex:1;min-width:0;display:grid;grid-template-columns:1fr auto;column-gap:0.4rem;row-gap:0.15rem;align-items:center;">
            <div class="item-name" style="grid-column:1;grid-row:1;">${item.title || '—'}</div>
            <div class="mob-dash-badges" style="grid-column:2;grid-row:1;gap:0.3rem;align-items:center;justify-content:flex-end;">${statusHtml}${typeBadge}</div>
            <div class="item-category" style="grid-column:1/3;grid-row:2;">${item.category || ''}</div>
            <div class="item-date-mob" style="grid-column:1/3;grid-row:3;">${dateStr}</div>
            ${location ? `<div class="mob-dash-meta" style="grid-column:1/3;grid-row:4;"><span>📍 ${location}</span></div>` : ''}
          </div>
        </div>
        <div class="dash-col-location">${location}</div>
        <div class="dash-col-date">${dateStr}</div>
        <div class="status-badge-container dash-col-status">${statusHtml}</div>
        <div class="dash-col-type">${typeBadge}</div>
      </div>`;
  }).join('');

  container.innerHTML = rowsHTML;

  container.querySelectorAll('.read-only-row').forEach(row => {
    row.style.cursor = 'pointer';
    row.addEventListener('mouseenter', function() { this.classList.add('table-row-hover'); });
    row.addEventListener('mouseleave', function() { this.classList.remove('table-row-hover'); });
    row.addEventListener('click', function(e) {
      e.preventDefault();
      const itemId   = this.dataset.id;
      const itemType = this.dataset.type;
      if (!itemId) return;
      if (itemType === 'lost') {
        if (window._openLostItemModal) window._openLostItemModal(itemId);
      } else {
        if (typeof showItemDetailsModal === 'function') showItemDetailsModal(itemId);
      }
    });
  });
}

// ── Archived Items section ───────────────────────────────────────────────────
// Archived found items and lost reports stay out of every count and out of the
// user-facing app, but live here so an admin can review or restore them.
function renderArchivedItems() {
  const container = document.getElementById('archivedItemsContainer');
  if (!container) return;

  const filter = document.getElementById('archivedTypeFilter')?.value || 'all';
  const found  = (_cachedFoundItems || []).filter(i => i.status === 'archived').map(i => ({ ...i, _type: 'found' }));
  const lost   = _lostItemsCurrent.filter(i => i.status === 'archived').map(i => ({ ...i, _type: 'lost' }));
  const items  = filter === 'found' ? found : filter === 'lost' ? lost : [...found, ...lost];

  // Most recently archived first; records predating the archivedAt field sort last
  items.sort((a, b) => (b.archivedAt?.toMillis?.() || 0) - (a.archivedAt?.toMillis?.() || 0));

  if (!items.length) {
    clearPager(container);
    const ready = _cachedFoundItems !== null || _lostItemsServerReady;
    container.innerHTML = ready
      ? '<div style="text-align:center;padding:2rem;color:#6b7280;">No archived items.</div>'
      : '<div style="text-align:center;padding:2rem;color:#6b7280;">Loading…</div>';
    return;
  }

  const rows = applyPagination('archived:' + filter, items, container, renderArchivedItems);

  container.innerHTML = rows.map(item => {
    const isLost = item._type === 'lost';
    const who  = item.archivedByAdmin ? `Admin (${item.archivedByAdminName || 'Administrator'})`
               : item.archivedByUser  ? (item.archivedByName || item.userName || 'Owner')
               : '—';
    const when = item.archivedAt ? formatDate(item.archivedAt) : '';
    const thumb = item.image
      ? `<img src="${item.image}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;" onerror="this.style.visibility='hidden'">`
      : `<div style="width:40px;height:40px;background:#f1f5f9;border-radius:6px;flex-shrink:0;"></div>`;
    const typeBadge = isLost
      ? `<span style="background:#fef3c7;color:#b45309;padding:2px 10px;border-radius:99px;font-size:0.7rem;font-weight:700;letter-spacing:0.04em;">LOST</span>`
      : `<span style="background:#dbeafe;color:#1e40af;padding:2px 10px;border-radius:99px;font-size:0.7rem;font-weight:700;letter-spacing:0.04em;">FOUND</span>`;

    return `
      <div class="table-row" style="grid-template-columns:2fr 1fr 1.5fr 1fr 1.4fr 100px 110px;">
        <div class="ai-name" style="display:flex;align-items:center;gap:0.75rem;">${thumb}<span style="font-weight:500;">${item.title || '—'}</span></div>
        <div class="ai-cat"  style="color:#64748b;">${item.category || '—'}</div>
        <div class="ai-loc"  style="color:#64748b;">${(isLost ? item.lastLocation : item.location) || '—'}</div>
        <div class="ai-date" style="color:#64748b;">${formatDate(isLost ? item.dateLost : item.date)}</div>
        <div class="ai-by"   style="color:#64748b;">${who}${when ? `<div style="font-size:0.75rem;color:#94a3b8;">${when}</div>` : ''}</div>
        <div class="ai-type">${typeBadge}</div>
        <div class="action-buttons">
          <button class="btn-icon" title="Restore" style="color:#1a2e6b;" onclick="window._restoreArchivedItem('${item._type}','${item.id}')">
            <i data-lucide="rotate-ccw" width="16" height="16"></i>
          </button>
        </div>
      </div>`;
  }).join('');

  if (window.lucide?.createIcons) lucide.createIcons();
}

// Put an archived record back into circulation. The status it held before being
// archived isn't stored, so it returns as 'active' — same as the lost item
// modal's Restore button.
window._restoreArchivedItem = function(type, id) {
  if (!confirm('Restore this item? It will become active again and reappear for users.')) return;
  const del = firebase.firestore.FieldValue.delete();
  firebase.firestore().collection(type === 'lost' ? 'lostItems' : 'items').doc(id).update({
    status: 'active',
    archivedByUser:      del,
    archivedByName:      del,
    archivedByEmail:     del,
    archivedByAdmin:     del,
    archivedByAdminName: del,
    archivedAt:          del
  }).catch(() => alert('Could not restore this item. Please try again.'));
};

// Current Found Items search query — owned here so a search filters the whole

// dataset rather than only the rows currently on screen.
let _itemsSearchQuery = '';

// Called by admin-search.js whenever the query changes
window._setItemsSearchQuery = function(q) {
  _itemsSearchQuery = q || '';
  const input = document.getElementById('itemSearchInput');
  // Only write back when clearing (the Clear Search button) — syncing the
  // trimmed value on every keystroke would eat a space as it is typed.
  if (input && !_itemsSearchQuery) input.value = '';

  resetPage('items'); // a new query is a new result set
  renderAllItems();
};

// Render All Items WITH ACTIONS (Items section)
function renderAllItems() {
  const container = document.getElementById('allItemsContainer');
  if (!container) return;

  // _cachedFoundItems is kept live by watchFoundItemsStats' onSnapshot.
  // If it's ready, render immediately. If not, show a loading state and wait —
  // watchFoundItemsStats will call renderAllItems() again once data arrives.
  if (_cachedFoundItems === null) {
    container.innerHTML = '<div class="table-row"><div style="grid-column: 1/-1; text-align: center; color:#64748b;">Loading items…</div></div>';
    return;
  }

  const q = _itemsSearchQuery.trim().toLowerCase();
  const matches = q
    ? _cachedFoundItems.filter(i =>
        `${i.title || ''} ${i.category || ''} ${i.location || ''}`.toLowerCase().includes(q))
    : _cachedFoundItems;

  if (q && !matches.length) {
    applyPagination('items', matches, container, renderAllItems); // clears the pager
    container.innerHTML = `<div class="table-row no-results-message"><div style="grid-column:1/-1;text-align:center;padding:2rem;">
        No items found matching "${q}" <button id="clearSearchBtn" class="btn-primary" style="margin-left:1rem;padding:0.25rem 0.5rem;">Clear Search</button>
      </div></div>`;
    document.getElementById('clearSearchBtn')?.addEventListener('click', () => window._setItemsSearchQuery(''));
    return;
  }

  displayItemsWithActions(applyPagination('items', matches, container, renderAllItems), container);
  if (q) container.querySelectorAll('.table-row').forEach(row => window.highlightMatches?.(row, q));
}

// Display Items WITH ACTIONS (Items section)
function displayItemsWithActions(items, container) {
  if (!items.length) {
    container.innerHTML = '<div class="table-row"><div style="grid-column: 1/-1; text-align: center;">No items found.</div></div>';
    return;
  }
  
  // Generate items WITH action buttons - NO HEADER
  const rowsHTML = items.map(item => `
    <div class="table-row interactive-row" data-id="${item.id}" data-status="${item.status}">
      <div class="item-info">
        <img src="${item.image}" alt="${item.title}" class="item-image" onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'">
        <div>
          <div class="item-name">${item.title}</div>
          <div class="item-category">${item.category || ''}</div>
        </div>
      </div>
      <div class="item-location">${item.location || ''}</div>
      <div class="item-date">${formatDate(item.date)}</div>
      <div class="status-dropdown-container">
        ${statusDropdown(item.status)}
      </div>
      <div class="action-buttons">
        <button class="btn-icon edit" title="Edit" data-action="edit"><i data-lucide="edit" width="16" height="16"></i></button>
        <button class="btn-icon delete" title="Delete" data-action="delete"><i data-lucide="trash-2" width="16" height="16"></i></button>
      </div>
    </div>
  `).join('');
  
  // Set the content WITHOUT adding a header
  container.innerHTML = rowsHTML;
  
  // Initialize Lucide icons
  if (window.lucide?.createIcons) lucide.createIcons();
  
  // Setup status change handlers
  setupStatusChangeHandlers(container);
  
  // Setup action button handlers
  setupActionButtonHandlers(container);
  
  // Make rows clickable to view details
  setupRowClickHandlers(container);
}

// Setup status change handlers
function setupStatusChangeHandlers(container) {
  container.querySelectorAll('.status-select').forEach(select => {
    // Prevent click propagation
    select.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Handle status change
    select.addEventListener('change', async (e) => {
      e.stopPropagation();
      const newStatus = e.target.value;
      const row = e.target.closest('.table-row');
      const id = row?.dataset?.id;
      const oldStatus = row?.dataset?.status;
      
      console.log('Status change requested:', { id, oldStatus, newStatus });
      
      if (newStatus === oldStatus) {
        console.log('Status unchanged, skipping update');
        return;
      }
      
      // Confirm status change
      const statusLabels = { active: 'Active', claimed: 'Claimed', soon: 'For Disposal', archived: 'Archived' };
      if (!confirm(`Change status to ${statusLabels[newStatus] || newStatus}?`)) {
        e.target.value = oldStatus;
        return;
      }
      
      // Disable the dropdown during update
      e.target.disabled = true;
      
      // Update status in Firebase
      try {
        console.log('Updating status in Firestore...');
        
        if (window.firebase?.firestore) {
          const db = firebase.firestore();
          const FV = firebase.firestore.FieldValue;
          const updateData = {
            status: newStatus,
            updatedAt: FV.serverTimestamp()
          };
          if (oldStatus === 'archived' && newStatus !== 'archived') {
            // Restoring — clear archive tracking fields
            updateData.archivedByAdmin     = FV.delete();
            updateData.archivedByAdminName = FV.delete();
            updateData.archivedAt          = FV.delete();
          } else if (newStatus === 'archived') {
            // Archiving via dropdown — record who did it
            updateData.archivedByAdmin     = true;
            updateData.archivedByAdminName = localStorage.getItem('adminName') || 'Admin';
            updateData.archivedAt          = FV.serverTimestamp();
          }
          await db.collection('items').doc(id).update(updateData);
          
          console.log('✓ Status updated in Firestore:', id, newStatus);
          
          // Verify the update by reading it back
          const doc = await db.collection('items').doc(id).get();
          const verifyStatus = doc.data()?.status;
          console.log('✓ Verified status in Firestore:', verifyStatus);
          
          row.dataset.status = newStatus;
          
          // Show success message
          const successMsg = document.createElement('div');
          successMsg.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:12px 20px;border-radius:8px;z-index:9999;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
          successMsg.textContent = `✓ Status changed to ${statusLabels[newStatus] || newStatus}`;
          document.body.appendChild(successMsg);
          setTimeout(() => successMsg.remove(), 3000);
          
        } else {
          throw new Error('Firebase not available');
        }
      } catch (error) {
        console.error('✗ Error updating status:', error);
        alert('Failed to update status: ' + error.message);
        e.target.value = oldStatus;
      } finally {
        // Re-enable the dropdown
        e.target.disabled = false;
      }
    });
  });
}

// Setup action button handlers
function setupActionButtonHandlers(container) {
  // Handle action button clicks
  container.querySelectorAll('.btn-icon').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const row = btn.closest('.table-row');
      const id = row?.dataset?.id;
      const action = btn.getAttribute('data-action');
      
      if (action === 'edit') {
        // Navigate to edit page
        window.location.href = 'add-item.html?edit=true&id=' + id;
      }
      else if (action === 'delete') {
        if (confirm('Archive this found item? It will remain in the list as Archived.')) {
          row.style.opacity = '0.5';
          row.style.pointerEvents = 'none';

          try {
            if (window.firebase?.firestore) {
              const adminName = localStorage.getItem('adminName') || 'Admin';
              await firebase.firestore().collection('items').doc(id).update({
                status: 'archived',
                archivedByAdmin: true,
                archivedByAdminName: adminName,
                archivedAt: firebase.firestore.FieldValue.serverTimestamp()
              });
              // Update the row in place — no hiding
              const select = row.querySelector('.status-select');
              if (select) {
                select.value = 'archived';
                select.dataset.currentStatus = 'archived';
              }
              row.dataset.status = 'archived';
              // Sync the in-memory cache so the detail modal shows the correct status
              if (_cachedFoundItems) {
                const idx = _cachedFoundItems.findIndex(i => i.id === id);
                if (idx !== -1) _cachedFoundItems[idx] = { ..._cachedFoundItems[idx], status: 'archived', archivedByAdmin: true, archivedByAdminName: adminName };
              }
            }
          } catch (error) {
            console.error('Error archiving item:', error);
          } finally {
            row.style.opacity = '';
            row.style.pointerEvents = '';
          }
        }
      }
    });
  });
}

// Setup row click handlers
function setupRowClickHandlers(container) {
  // Make rows clickable to view details
  container.querySelectorAll('.interactive-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (!e.target.closest('.btn-icon') && !e.target.closest('.status-select')) {
        const id = row.dataset.id;
        if (id && typeof showItemDetailsModal === 'function') {
          // Show modal instead of navigating
          e.preventDefault();
          e.stopPropagation();
          showItemDetailsModal(id);
        } else if (id) {
          console.log('Modal function not available, falling back to navigation');
          window.location.href = 'item-details.html?id=' + id;
        }
      }
    });

    // Add hover effect handlers
    row.addEventListener('mouseenter', function() {
      this.classList.add('table-row-hover');
    });
    
    row.addEventListener('mouseleave', function() {
      this.classList.remove('table-row-hover');
    });
    
    row.style.cursor = 'pointer';
  });
}

// Render inbox messages - just calls forceRefreshInbox
function renderInbox() {
  console.log('Rendering inbox messages...');
  // forceRefreshInbox already handles showing a loading message
  forceRefreshInbox();
}

// Force refresh inbox with fresh data
function forceRefreshInbox() {
  console.log('Forcing inbox refresh with fresh data...');
  
  // Clear any cache that might exist in MessagesStore
  if (window.MessagesStore?.clearCache) {
    window.MessagesStore.clearCache();
  }
  
  // Show loading indicator
  const container = document.getElementById('inboxContainer');
  if (container) {
    container.innerHTML = '<div class="table-row"><div style="grid-column: 1/-1; text-align: center; padding: 1rem;">Loading messages...</div></div>';
  }
  
  // Always force a fresh fetch from the server
  if (window.MessagesStore?.getAllAsync) {
    // Add a cache-busting parameter to ensure we get fresh data
    const options = { forceFresh: true, timestamp: Date.now() };
    
    window.MessagesStore.getAllAsync(options)
      .then(msgs => {
        console.log('Retrieved', msgs.length, 'fresh messages');
        
        if (container) {
          updateInboxNotification(msgs);
          displayInboxMessages(msgs, container);
        }
      })
      .catch(err => {
        console.error('Error during forced inbox refresh:', err);
        
        if (container) {
          container.innerHTML = `<div class="table-row"><div style="grid-column: 1/-1; text-align: center; padding: 1rem; color: #ef4444;">
            Error loading messages: ${err.message || 'Unknown error'}
            <br><button id="retryInboxBtn" class="btn-primary" style="margin-top: 1rem;">Retry</button>
          </div></div>`;
          
          // Add retry button functionality
          const retryBtn = document.getElementById('retryInboxBtn');
          if (retryBtn) {
            retryBtn.addEventListener('click', forceRefreshInbox);
          }
        }
      });
  } else {
    console.error('MessagesStore.getAllAsync not available');
    if (container) {
      container.innerHTML = '<div class="table-row"><div style="grid-column: 1/-1; text-align: center; padding: 1rem; color: #ef4444;">Message loading not available</div></div>';
    }
  }
}

// Show desktop notification
function showDesktopNotification(message) {
  if (!("Notification" in window)) {
    return;
  }
  
  if (Notification.permission === "granted") {
    const notification = new Notification("New Message", {
      body: message.subject || "You have a new message",
      icon: "/img/notification-icon.png"
    });
    
    notification.onclick = function() {
      window.focus();
      document.querySelector('.nav-link[data-section="inbox"]').click();
    };
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(function (permission) {
      if (permission === "granted") {
        showDesktopNotification(message);
      }
    });
  }
}

// Display inbox messages in the UI
function displayInboxMessages(messages, container) {
  if (!container) return;
  
  // Handle empty inbox
  if (!messages || !messages.length) {
    container.innerHTML = '<div class="table-row"><div style="grid-column: 1/-1; text-align: center; padding: 2rem;">No messages in your inbox.</div></div>';
    return;
  }
  
  // Sort messages by date (newest first)
  const sortedMessages = [...messages].sort((a, b) => {
    const dateA = a.date ? new Date(a.date) : new Date(0);
    const dateB = b.date ? new Date(b.date) : new Date(0);
    return dateB - dateA; // Newest first
  });
  
  // Generate HTML for each message
  const messagesHtml = sortedMessages.map(msg => {
    const isUnread = msg.unread === true;
    const msgClass = isUnread ? 'unread-message' : '';
    const fromName = msg.name || msg.from || 'Unknown';
    const formattedDate = msg.date ? new Date(msg.date).toLocaleString() : 'Unknown date';
    
    return `
      <div class="table-row ${msgClass}" data-id="${msg.id || ''}" data-email="${msg.from || msg.email || ''}">
        <div class="message-sender">
          ${isUnread ? '<span class="unread-dot"></span>' : ''}
          ${fromName}
        </div>
        <div class="message-subject">${msg.subject || 'No subject'}</div>
        <div class="message-date">${formattedDate}</div>
        <div class="action-buttons">
          <button class="btn-icon" title="View" data-action="view">
            <i data-lucide="eye" width="16" height="16"></i>
          </button>
          <button class="btn-icon delete" title="Delete" data-action="delete">
            <i data-lucide="trash-2" width="16" height="16"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  // Update the container
  container.innerHTML = messagesHtml;
  
  // Initialize icons
  if (window.lucide?.createIcons) lucide.createIcons();
  
  // Add event listeners to messages
  setupMessageActionHandlers(container);
}

// Update inbox notification badge
function updateInboxNotification(messages) {
  // Find unread messages
  const unreadCount = messages.filter(msg => msg.unread === true).length;
  
  // Update badge
  const badge = document.getElementById('inboxNotificationBadge');
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }
}

// Set up message action handlers
function setupMessageActionHandlers(container) {
  // Handle clicks on message rows and action buttons
  container.querySelectorAll('.table-row').forEach(row => {
    row.addEventListener('click', function(e) {
      // Don't handle if clicking on action buttons
      if (e.target.closest('.btn-icon')) return;
      
      const messageId = this.dataset.id;
      viewMessage(messageId, this);
    });
    
    // Action button handlers
    row.querySelectorAll('.btn-icon').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const action = this.getAttribute('data-action');
        const messageId = row.dataset.id;
        
        if (action === 'view') {
          viewMessage(messageId, row);
        } else if (action === 'delete') {
          if (confirm('Delete this message?')) {
            deleteMessage(messageId, row);
          }
        }
      });
    });
  });
}

// View a message
function viewMessage(messageId, row) {
  if (!messageId) return;
  
  console.log('Viewing message:', messageId);
  
  // Mark as read in the UI
  if (row) {
    row.classList.remove('unread-message');
    row.querySelector('.unread-dot')?.remove();
  }
  
  // TODO: Implement actual message viewing
  alert('Message viewing not implemented yet');
  
  // Mark as read in data store
  if (window.MessagesStore?.markAsReadAsync) {
    window.MessagesStore.markAsReadAsync(messageId).catch(err => {
      console.error('Error marking message as read:', err);
    });
  }
}

// Delete a message
function deleteMessage(messageId, row) {
  if (!messageId) return;
  
  console.log('Deleting message:', messageId);
  
  // Remove from UI
  if (row) {
    row.style.opacity = '0.5';
    setTimeout(() => row.style.display = 'none', 300);
  }
  
  // Remove from data store
  if (window.MessagesStore?.deleteAsync) {
    window.MessagesStore.deleteAsync(messageId).catch(err => {
      console.error('Error deleting message:', err);
    });
  }
}

// ── Stat-card month-over-month delta indicators ────────────────────────────────
function updateStatTrends(foundItems, lostItems) {
  const now      = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prev     = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  const prevLabel = prev.toLocaleDateString('en-PH', { month: 'long' });

  function getMonth(item) {
    const raw = item.date || item.createdAt || item.postedAt || item.dateLost;
    if (!raw) return null;
    if (typeof raw === 'string') return raw.substring(0, 7);
    if (raw.toDate) return raw.toDate().toISOString().substring(0, 7);
    if (raw instanceof Date) return raw.toISOString().substring(0, 7);
    return null;
  }

  function setPill(id, thisN, lastN) {
    const el = document.getElementById(id);
    if (!el) return;
    if (thisN === 0 && lastN === 0) { el.innerHTML = ''; return; }
    if (lastN === 0) {
      el.className = 'stat-delta up';
      el.innerHTML = `&#9650; ${thisN} new this month`;
      return;
    }
    const pct = ((thisN - lastN) / lastN) * 100;
    const abs = Math.round(Math.abs(pct));
    if (pct > 0) {
      el.className = 'stat-delta up';
      el.innerHTML = `&#9650; +${abs}% vs ${prevLabel}`;
    } else if (pct < 0) {
      el.className = 'stat-delta down';
      el.innerHTML = `&#9660; &minus;${abs}% vs ${prevLabel}`;
    } else {
      el.className = 'stat-delta flat';
      el.innerHTML = `&#8594; same as ${prevLabel}`;
    }
  }

  // Total items: same pool as the Total Items card (non-archived found + lost reports)
  const totalPool  = [...foundItems.filter(isNotArchived), ...(lostItems || []).filter(isNotArchived)];
  const thisTotal  = totalPool.filter(i => getMonth(i) === thisMonth).length;
  const lastTotal  = totalPool.filter(i => getMonth(i) === lastMonth).length;
  setPill('deltaTotalItems', thisTotal, lastTotal);

  // Active found items added this month vs last
  const thisFound  = foundItems.filter(i => getMonth(i) === thisMonth).length;
  const lastFound  = foundItems.filter(i => getMonth(i) === lastMonth).length;
  setPill('deltaActive', thisFound, lastFound);

  // Lost items reported this month vs last
  if (lostItems && lostItems.length) {
    const thisLost = lostItems.filter(i => getMonth(i) === thisMonth).length;
    const lastLost = lostItems.filter(i => getMonth(i) === lastMonth).length;
    setPill('deltaActiveLost', thisLost, lastLost);
  }

  // Claimed items: use updatedAt (set when status changed to 'claimed') not the found date
  function claimMonth(item) {
    const raw = item.updatedAt;
    if (!raw) return null;
    if (raw.toDate) return raw.toDate().toISOString().substring(0, 7);
    if (raw instanceof Date) return raw.toISOString().substring(0, 7);
    return null;
  }
  const claimedAll  = foundItems.filter(i => i.status === 'claimed');
  const thisClaimed = claimedAll.filter(i => claimMonth(i) === thisMonth).length;
  const lastClaimed = claimedAll.filter(i => claimMonth(i) === lastMonth).length;
  setPill('deltaClaimed', thisClaimed, lastClaimed);

  // Archived items: by when they were archived, not when they were found or lost
  function archiveMonth(item) {
    const raw = item.archivedAt;
    if (!raw) return null;
    if (raw.toDate) return raw.toDate().toISOString().substring(0, 7);
    if (raw instanceof Date) return raw.toISOString().substring(0, 7);
    return null;
  }
  const archivedAll  = [...foundItems, ...(lostItems || [])].filter(i => i.status === 'archived');
  const thisArchived = archivedAll.filter(i => archiveMonth(i) === thisMonth).length;
  const lastArchived = archivedAll.filter(i => archiveMonth(i) === lastMonth).length;
  setPill('deltaArchived', thisArchived, lastArchived);

}
