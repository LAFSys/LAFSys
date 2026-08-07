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
  watchFoundItemsStats();  // replaces renderStats() + keeps total/active live
  renderInbox();
  watchActiveLostCount();
  watchClaimedResolvedCount();
  watchPendingLostCount();
  initAdminLostItems(); // keeps _lostItemsCurrent live for modal lookups
  
  // If not on dashboard, load the appropriate section data
  if (lastActiveSection === 'users') renderUsers();
  if (lastActiveSection === 'items') renderAllItems();
  
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

  const titleMap = { dashboard: 'Dashboard', users: 'Users', items: 'Found Items', inbox: 'Inbox', claims: 'Claims', 'add-item': 'Add Item', 'lost-items': 'Lost Items' };
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = titleMap[section] || 'Dashboard';

  if (section === 'lost-items') initAdminLostItems();
}

// ── Admin Lost Items ──────────────────────────────────────────────────────────
let _lostItemsUnsub = null;
let _lostItemsCurrent = [];
let _lostItemModalId = null;
let _lostItemCurrentData = null;

function initAdminLostItems() {
  if (_lostItemsUnsub) return; // already listening
  const db = firebase.firestore();
  _lostItemsUnsub = db.collection('lostItems')
    .orderBy('postedAt', 'desc')
    .onSnapshot({ includeMetadataChanges: true }, snap => {
      _lostItemsCurrent = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      _renderAdminLostItems();
      // Only re-render dashboard table from server data to avoid stale-cache flashes
      if (_statsInitialized && !snap.metadata.fromCache) renderRecentItemsWithoutActions();
      if (_cachedFoundItems) updateStatTrends(_cachedFoundItems, _lostItemsCurrent);
    }, () => {});

  document.getElementById('lostItemStatusFilter')?.addEventListener('change', _renderAdminLostItems);
}

function _renderAdminLostItems() {
  const container = document.getElementById('lostItemsAdminContainer');
  if (!container) return;
  const filter = document.getElementById('lostItemStatusFilter')?.value || 'all';
  const items = filter === 'all' ? _lostItemsCurrent : _lostItemsCurrent.filter(i => i.status === filter);

  if (items.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:#6b7280;">No lost items found.</div>';
    return;
  }

  container.innerHTML = items.map(item => {
    const isPending   = item.status === 'pending';
    const isDeclined  = item.status === 'declined';
    const isPendingEdit = isPending && (item.isEdited || item.updatedAt);
    const statusColor = item.status === 'resolved' ? '#10b981'
                      : isPendingEdit ? '#7c3aed'
                      : isPending   ? '#dc2626'
                      : isDeclined  ? '#64748b'
                      : '#f59e0b';
    const statusLabel = isPendingEdit ? 'Pending Edit'
                      : isPending  ? 'Pending'
                      : isDeclined ? 'Declined'
                      : (item.status || 'active');
    const thumb = item.image
      ? `<img src="${item.image}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;">`
      : `<div style="width:40px;height:40px;background:#f1f5f9;border-radius:6px;flex-shrink:0;"></div>`;
    return `
      <div class="table-row" style="grid-template-columns:2fr 1fr 1.5fr 1fr 1.2fr 100px 120px;cursor:pointer;" onclick="window._openLostItemModal('${item.id}')">
        <div style="display:flex;align-items:center;gap:0.75rem;">${thumb}<span style="font-weight:500;">${item.title || '—'}</span></div>
        <div style="color:#64748b;">${item.category || '—'}</div>
        <div style="color:#64748b;">${item.lastLocation || '—'}</div>
        <div style="color:#64748b;">${item.dateLost || '—'}</div>
        <div style="color:#64748b;">${item.userName || item.userEmail || '—'}</div>
        <div><span style="background:${statusColor}22;color:${statusColor};padding:2px 10px;border-radius:99px;font-size:0.78rem;font-weight:600;text-transform:capitalize;">${statusLabel}</span></div>
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

  // Edit notice banner
  let editNotice = document.getElementById('liamEditNotice');
  if (isPendingEdit) {
    if (!editNotice) {
      editNotice = document.createElement('div');
      editNotice.id = 'liamEditNotice';
      editNotice.style.cssText = 'background:#ede9fe;border:1px solid #c4b5fd;border-radius:6px;padding:0.6rem 0.85rem;font-size:0.83rem;color:#5b21b6;margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem;';
      editNotice.innerHTML = '<span style="font-size:1rem;">✏️</span><span>The user has submitted edits to this report. Review the changes below and approve or decline.</span>';
      const descSection = document.querySelector('#lostItemAdminModal .item-detail-section');
      if (descSection) descSection.parentNode.insertBefore(editNotice, descSection);
    }
    editNotice.style.display = 'flex';
  } else {
    if (editNotice) editNotice.style.display = 'none';
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

  if (item.status === 'pending') {
    if (approveBtn) approveBtn.style.display = '';
    if (declineBtn) declineBtn.style.display = '';
    if (resolveBtn) resolveBtn.style.display = 'none';
    if (editBtn)    editBtn.style.display    = 'none';
  } else {
    if (approveBtn) approveBtn.style.display = 'none';
    if (declineBtn) declineBtn.style.display = 'none';
    if (resolveBtn) {
      resolveBtn.style.display = '';
      resolveBtn.textContent = item.status === 'resolved' ? 'Mark as Active' : 'Mark as Resolved';
    }
    if (editBtn) editBtn.style.display = '';
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
  if (panel) panel.style.display = 'flex';
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
  firebase.firestore().collection('lostItems').doc(_lostItemModalId)
    .update({ status: 'declined', declineReason: reason }).catch(() => {});
  if (item) _sendLostItemNotification({ ...item, _declineReason: reason }, 'lost_declined');
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
  if (!confirm('Delete this lost item report? This cannot be undone.')) return;
  const item = _lostItemsCurrent.find(i => i.id === _lostItemModalId);
  firebase.firestore().collection('lostItems').doc(_lostItemModalId).delete().catch(() => {});
  if (item && item.status === 'pending') _sendLostItemNotification(item, 'lost_declined');
  document.getElementById('lostItemAdminModal').style.display = 'none';
};

window._lostItemAdminDeleteId = function(id) {
  if (!confirm('Delete this lost item report? This cannot be undone.')) return;
  const item = _lostItemsCurrent.find(i => i.id === id);
  firebase.firestore().collection('lostItems').doc(id).delete().catch(() => {});
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
  const total   = items.length;
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

// Real-time watcher for Total Items + Active Found Items stats and recent table
function watchFoundItemsStats() {
  let retries = 40;
  function tryWatch() {
    try {
      if (!window.firebase || !firebase.apps || !firebase.apps.length) throw new Error('not ready');
      // includeMetadataChanges lets us tell cache snapshots from server snapshots.
      // Firebase offline persistence fires a cache snapshot first (often empty/stale),
      // which would set _cachedFoundItems=[] and render "No items found" before the
      // real data arrives. We update stats from cache (quick feedback) but only
      // populate _cachedFoundItems and render the table from the server snapshot.
      firebase.firestore().collection('items').onSnapshot({ includeMetadataChanges: true }, snap => {
        const safe = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
        safe('statTotalItems', snap.size);
        safe('statActive', snap.docs.filter(d => d.data().status === 'active').length);
        if (snap.metadata.fromCache) return; // keep skeleton until server confirms
        _statsInitialized = true;
        _cachedFoundItems = snap.docs.map(d => ({ id: d.id, _type: 'found', ...d.data() }));
        renderRecentItemsWithoutActions();
        updateStatTrends(_cachedFoundItems, _lostItemsCurrent);
      }, () => {});
    } catch (e) {
      if (retries-- > 0) setTimeout(tryWatch, 300);
    }
  }
  tryWatch();
}

function watchActiveLostCount() {
  let retries = 40;
  function tryWatch() {
    try {
      if (!window.firebase || !firebase.apps || !firebase.apps.length) throw new Error('not ready');
      firebase.firestore().collection('lostItems')
        .onSnapshot(snap => {
          const count = snap.docs.filter(d => (d.data().status || 'active') === 'active').length;
          const el = document.getElementById('statActiveLost');
          if (el) el.textContent = count;
        }, () => {});
    } catch (e) {
      if (retries-- > 0) setTimeout(tryWatch, 300);
    }
  }
  tryWatch();
}

// Notification badge + toast for pending lost item submissions
function watchPendingLostCount() {
  let retries = 40;
  let prevCount = null; // null = first load, don't toast
  function tryWatch() {
    try {
      if (!window.firebase || !firebase.apps || !firebase.apps.length) throw new Error('not ready');
      firebase.firestore().collection('lostItems').where('status', '==', 'pending')
        .onSnapshot(snap => {
          const count = snap.size;
          const badge = document.getElementById('pendingLostBadge');
          if (badge) {
            if (count > 0) {
              badge.textContent = count;
              badge.style.display = '';
            } else {
              badge.style.display = 'none';
            }
          }
          // Show toast only when a new item arrives after initial load
          if (prevCount !== null && count > prevCount) {
            const added = count - prevCount;
            showAdminToast(
              `${added} new lost item report${added > 1 ? 's' : ''} pending approval`,
              'lost-items'
            );
          }
          prevCount = count;
        }, () => {});
    } catch (e) {
      if (retries-- > 0) setTimeout(tryWatch, 300);
    }
  }
  tryWatch();
}

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
  return '<span class="status-badge status-active">Active</span>';
}

// Status dropdown for Items section only
function statusDropdown(currentStatus) {
  const statuses = [
    { value: 'active', label: 'Active', class: 'status-active' },
    { value: 'claimed', label: 'Claimed', class: 'status-completed' },
    { value: 'soon', label: 'For Disposal', class: 'status-pending' }
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
  const headingMap = { all: 'Recent Items', active: 'Recent Active Found Items', claimed: 'Recent Claimed / Resolved Items', soon: 'Recent Items for Disposal', lost: 'Active Lost Reports' };
  const titleMap   = { all: 'Dashboard',    active: 'Active Found Items',        claimed: 'Items Claimed / Resolved',       soon: 'Items for Disposal',         lost: 'Active Lost Items' };
  if (heading) heading.textContent = headingMap[filterType] || 'Recent Items';
  if (titleEl)  titleEl.textContent  = titleMap[filterType]  || 'Dashboard';
  renderRecentItemsWithoutActions(filterType);
};

// Render combined found + lost items in the dashboard table
function renderRecentItemsWithoutActions(statusFilter) {
  const container = document.getElementById('recentItemsContainer');
  if (!container) return;

  const needFound = !statusFilter || statusFilter === 'all' || statusFilter === 'active' || statusFilter === 'claimed' || statusFilter === 'soon';
  const needLost  = !statusFilter || statusFilter === 'all' || statusFilter === 'lost' || statusFilter === 'claimed';

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
    let combined = [...foundItems, ...lostItems]; // both already carry _type

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

    // 'all' shows everything; specific filters cap at 10
    const limit = (!statusFilter || statusFilter === 'all') ? combined.length : 10;
    displayReadOnlyRecentItems(combined.slice(0, limit), container);
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
        <div class="item-info">
          <img src="${imgSrc}" alt="${item.title || ''}" class="item-image" onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'">
          <div>
            <div class="item-name">${item.title || '—'}</div>
            <div class="item-category">${item.category || ''}</div>
          </div>
        </div>
        <div>${location}</div>
        <div>${dateStr}</div>
        <div class="status-badge-container">${statusHtml}</div>
        <div>${typeBadge}</div>
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

// Render All Items WITH ACTIONS (Items section)
function renderAllItems() {
  const container = document.getElementById('allItemsContainer');
  if (!container) return;
  
  // Show loading state
  container.innerHTML = '<div class="table-row"><div style="grid-column: 1/-1; text-align: center;">Loading all items...</div></div>';
  
  // Get items
  if (window.DataStore?.getItemsAsync) {
    window.DataStore.getItemsAsync().then(items => {
      displayItemsWithActions(items, container);
    }).catch(err => {
      console.error('Error loading all items:', err);
      container.innerHTML = '<div class="table-row"><div style="grid-column: 1/-1; text-align: center;">Error loading items</div></div>';
    });
  } else {
    // Fall back to old method
    const items = window.DataStore?.getItemsSync?.() || [];
    displayItemsWithActions(items, container);
  }
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
      <div>${item.location || ''}</div>
      <div>${formatDate(item.date)}</div>
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
      const statusLabels = { active: 'Active', claimed: 'Claimed', soon: 'For Disposal' };
      if (!confirm(`Change status to ${statusLabels[newStatus]}?`)) {
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
          await db.collection('items').doc(id).update({ 
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          
          console.log('✓ Status updated in Firestore:', id, newStatus);
          
          // Verify the update by reading it back
          const doc = await db.collection('items').doc(id).get();
          const verifyStatus = doc.data()?.status;
          console.log('✓ Verified status in Firestore:', verifyStatus);
          
          row.dataset.status = newStatus;
          
          // Show success message
          const successMsg = document.createElement('div');
          successMsg.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:12px 20px;border-radius:8px;z-index:9999;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
          successMsg.textContent = `✓ Status changed to ${statusLabels[newStatus]}`;
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
        if (confirm('Are you sure you want to delete this item?')) {
          row.style.opacity = '0.5';
          row.style.pointerEvents = 'none';
          
          try {
            // Try to delete from Firebase if available
            if (window.firebase?.firestore) {
              await firebase.firestore().collection('items').doc(id).delete();
              console.log('Item deleted from Firebase:', id);
            }
          } catch (error) {
            console.error('Error deleting item:', error);
          }
          
          setTimeout(()=>{ row.style.display = 'none'; }, 200);
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

  // Total items found (by found date)
  const thisTotal  = foundItems.filter(i => getMonth(i) === thisMonth).length;
  const lastTotal  = foundItems.filter(i => getMonth(i) === lastMonth).length;
  setPill('deltaTotalItems', thisTotal, lastTotal);

  // Active found items added this month vs last
  setPill('deltaActive', thisTotal, lastTotal);

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
}
