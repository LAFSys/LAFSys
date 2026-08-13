/**
 * Admin Live Chat Implementation
 * Provides real-time chat functionality for the admin dashboard
 */

// Firebase chat configuration
const CHAT_COLLECTION = 'liveChats';
const CHAT_MESSAGES_COLLECTION = 'messages';
const IDLE_TIMEOUT = 3 * 60 * 1000; // 3 minutes in milliseconds

// Chat state management
let currentChats = [];
let activeChatId = null;
let idleTimers = {};
let currentChatUser = null;

// User presence listener state
let userPresenceUnsubscribe = null;
let userPresenceTickInterval = null;

// Messages listener — kept so we can unsubscribe before opening a new chat
let _messagesUnsubscribe = null;

// Cache resolved display names to avoid repeated Cloud Function calls
const resolvedNameCache = {};

// Notification state
let knownChatIds = new Set();
let isFirstServerSnapshot = true; // true until the first non-cache snapshot is consumed
let newChatCount = 0;
const originalPageTitle = document.title || 'Admin Dashboard - Lost & Found Baguio';
let titleFlashInterval = null;

// DOM elements - will be initialized on load
let chatContainer;
let activeChatsList;
let chatWindow;
let messagesList;
let chatForm;

// ==================== ADMIN PRESENCE ====================

let presenceHeartbeat = null;

function setAdminPresence(online) {
  if (!window.firebase?.firestore) return;
  firebase.firestore().collection('adminPresence').doc('status').set({
    online: online,
    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});
}

function startPresenceHeartbeat() {
  if (presenceHeartbeat) return; // already running
  setAdminPresence(true);
  // Refresh lastSeen every 30 seconds so the user side can detect stale sessions
  presenceHeartbeat = setInterval(() => setAdminPresence(true), 30000);
}

function stopPresenceHeartbeat() {
  clearInterval(presenceHeartbeat);
  presenceHeartbeat = null;
  setAdminPresence(false);
}

// ==================== NOTIFICATION SYSTEM ====================

// Initialize live chat system
document.addEventListener('DOMContentLoaded', function() {
  console.log('Initializing Admin Live Chat system');

  // Add chat styles
  addChatStyles();

  // Add notification styles
  addNotificationStyles();

  window.addEventListener('beforeunload', stopPresenceHeartbeat);

  // Start background listener for new chat notifications (runs on ALL sections)
  startNotificationListener();

  // Wire up nav links: go online when inbox is active, offline when leaving it
  document.querySelectorAll('.nav-link[data-section]').forEach(link => {
    if (link.getAttribute('data-section') === 'inbox') {
      link.addEventListener('click', function() {
        clearInboxNotification();
        initializeChatInterface();
        _goOnlineWhenReady();
      });
    } else {
      link.addEventListener('click', function() {
        stopPresenceHeartbeat();
      });
    }
  });

  // IMPORTANT: If page loads with inbox section active, initialize the chat interface immediately
  const lastActiveSection = localStorage.getItem('adminActiveSection');
  if (lastActiveSection === 'inbox') {
    console.log('Inbox was last active section - initializing Live Chat on page load');
    setTimeout(() => {
      clearInboxNotification();
      initializeChatInterface();
      _goOnlineWhenReady();
    }, 100);
  }
});

// Wait for Firebase then go online — safe to call multiple times
function _goOnlineWhenReady() {
  if (window.firebase?.firestore) {
    startPresenceHeartbeat();
    return;
  }
  const wait = setInterval(() => {
    if (window.firebase?.firestore) {
      clearInterval(wait);
      startPresenceHeartbeat();
    }
  }, 500);
}

// ==================== NOTIFICATION SYSTEM ====================

// Start a background Firestore listener for new chats
function startNotificationListener() {
  // Check that Firebase is actually initialized (not just the SDK loaded)
  if (!window.firebase?.apps?.length) {
    setTimeout(startNotificationListener, 2000);
    return;
  }

  const db = firebase.firestore();

  // includeMetadataChanges lets us distinguish cache snapshots from server snapshots.
  // Firebase offline persistence fires onSnapshot TWICE on startup:
  //   1. A cache snapshot (fromCache:true)  — may be empty or stale
  //   2. A server snapshot (fromCache:false) — the real current data
  // Without this flag the old isFirstLoad trick was consumed by the (possibly empty) cache
  // snapshot, making all real server docs look like "new" chats.
  db.collection(CHAT_COLLECTION)
    .where('active', '==', true)
    .where('isNewSession', '==', true)
    .onSnapshot({ includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache) {
        // Cache snapshot — silently populate knownChatIds.
        // Only badge chats that actually have unread messages (unreadCount > 0),
        // not every active chat the admin just hasn't archived yet.
        let unread = 0;
        snapshot.forEach(doc => {
          knownChatIds.add(doc.id);
          if ((doc.data().unreadCount || 0) > 0) unread++;
        });
        if (unread > 0 && localStorage.getItem('adminActiveSection') !== 'inbox') {
          newChatCount = unread;
          updateInboxBadge(unread);
        }
        return;
      }

      if (isFirstServerSnapshot) {
        // First real server snapshot — silently record existing chats.
        // Show badge only for chats with actual unread messages.
        let unread = 0;
        snapshot.forEach(doc => {
          knownChatIds.add(doc.id);
          if ((doc.data().unreadCount || 0) > 0) unread++;
        });
        isFirstServerSnapshot = false;
        if (localStorage.getItem('adminActiveSection') !== 'inbox') {
          newChatCount = unread;
          updateInboxBadge(unread);
        }
        return;
      }

      // Subsequent server snapshots — detect chats that genuinely arrived this session
      let newChatsDetected = 0;
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          knownChatIds.delete(change.doc.id);
          newChatCount = Math.max(0, newChatCount - 1);
          return;
        }
        if (change.type === 'added' && !knownChatIds.has(change.doc.id)) {
          knownChatIds.add(change.doc.id);
          newChatsDetected++;
          const chatData = change.doc.data();
          showNewChatToast(chatData.userName || 'Unknown User');
          playNotificationSound();
        }
      });

      if (newChatsDetected > 0) {
        const activeSection = localStorage.getItem('adminActiveSection');
        if (activeSection !== 'inbox') {
          newChatCount += newChatsDetected;
          updateInboxBadge(newChatCount);
        }
        updateTabTitle(newChatCount > 0 ? newChatCount : newChatsDetected);
      } else {
        // Update badge in case removals changed the count
        updateInboxBadge(newChatCount);
      }
    }, (error) => {
      console.error('Notification listener error:', error);
    });
}

// Update the inbox notification badge
function updateInboxBadge(count) {
  const badge = document.getElementById('inboxNotificationBadge');
  if (!badge) return;
  
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'inline-flex';
    
    // Add pulse animation
    badge.classList.remove('pulse');
    void badge.offsetWidth; // Force reflow to restart animation
    badge.classList.add('pulse');
  } else {
    badge.style.display = 'none';
    badge.classList.remove('pulse');
  }
}

// Clear the inbox notification
function clearInboxNotification() {
  newChatCount = 0;
  updateInboxBadge(0);
  updateTabTitle(0);
}

// Update the browser tab title with notification count
function updateTabTitle(count) {
  // Clear any existing flash interval
  if (titleFlashInterval) {
    clearInterval(titleFlashInterval);
    titleFlashInterval = null;
  }
  
  if (count > 0) {
    var newTitle = '(' + count + ') ' + originalPageTitle;
    document.title = newTitle;
    console.log('Tab title updated to:', document.title);
    
    // Flash the title to grab attention
    var showNotification = true;
    titleFlashInterval = setInterval(function() {
      if (newChatCount <= 0) {
        clearInterval(titleFlashInterval);
        titleFlashInterval = null;
        document.title = originalPageTitle;
        return;
      }
      if (showNotification) {
        document.title = '(' + newChatCount + ') New Chat!';
      } else {
        document.title = '(' + newChatCount + ') ' + originalPageTitle;
      }
      showNotification = !showNotification;
    }, 1500);
  } else {
    document.title = originalPageTitle;
  }
}

// Show a toast notification for new chat
function showNewChatToast(userName) {
  // Remove any existing toast
  const existingToast = document.querySelector('.chat-notification-toast');
  if (existingToast) existingToast.remove();
  
  const toast = document.createElement('div');
  toast.className = 'chat-notification-toast';
  toast.innerHTML = `
    <div class="toast-icon">💬</div>
    <div class="toast-content">
      <div class="toast-title">New Chat Message</div>
      <div class="toast-body">${userName} started a new chat</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  
  // Click toast to go to inbox
  toast.addEventListener('click', function(e) {
    if (e.target.className !== 'toast-close') {
      // Navigate to inbox section
      const inboxLink = document.querySelector('.nav-link[data-section="inbox"]');
      if (inboxLink) inboxLink.click();
      toast.remove();
    }
  });
  
  document.body.appendChild(toast);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.add('toast-fade-out');
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);
}

// Shared AudioContext - initialized on first user interaction to comply with browser autoplay policy
let sharedAudioContext = null;

// Initialize AudioContext on first user click (required by browsers)
document.addEventListener('click', function initAudio() {
  if (!sharedAudioContext) {
    sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    console.log('AudioContext initialized on user interaction');
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume();
  }
}, { once: false });

// Play a notification sound
function playNotificationSound() {
  try {
    // Create or resume AudioContext
    if (!sharedAudioContext) {
      sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume();
    }
    
    var ctx = sharedAudioContext;
    
    // First tone - D5
    var osc1 = ctx.createOscillator();
    var gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.value = 587.33;
    osc1.type = 'sine';
    gain1.gain.setValueAtTime(0.4, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.3);
    
    // Second tone - A5 (higher, delayed)
    var osc2 = ctx.createOscillator();
    var gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 880;
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.4, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.45);
    
    console.log('Notification sound played');
  } catch (e) {
    console.log('Could not play notification sound:', e);
  }
}

// Add notification-specific styles
function addNotificationStyles() {
  if (document.getElementById('admin-notification-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'admin-notification-styles';
  style.textContent = `
    /* Notification Badge */
    .notification-badge {
      position: absolute;
      top: -8px;
      right: -12px;
      background-color: #ef4444;
      color: white;
      font-size: 0.7rem;
      font-weight: 700;
      min-width: 18px;
      height: 18px;
      border-radius: 9px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      box-shadow: 0 2px 4px rgba(239, 68, 68, 0.4);
      z-index: 100;
    }
    
    .notification-badge.pulse {
      animation: badgePulse 1s ease-in-out 3;
    }
    
    @keyframes badgePulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.3); }
    }
    
    /* Toast Notification */
    .chat-notification-toast {
      position: fixed;
      top: 20px;
      right: 20px;
      background: white;
      border-left: 4px solid #1a2e6b;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 99999;
      cursor: pointer;
      min-width: 280px;
      max-width: 400px;
      animation: toastSlideIn 0.3s ease-out;
      transition: opacity 0.3s ease;
    }
    
    .chat-notification-toast:hover {
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
    }
    
    .toast-fade-out {
      opacity: 0 !important;
    }
    
    @keyframes toastSlideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    
    .toast-icon {
      font-size: 1.5rem;
      flex-shrink: 0;
    }
    
    .toast-content {
      flex: 1;
    }
    
    .toast-title {
      font-weight: 700;
      font-size: 0.9rem;
      color: #1e293b;
      margin-bottom: 2px;
    }
    
    .toast-body {
      font-size: 0.8rem;
      color: #64748b;
    }
    
    .toast-close {
      background: none;
      border: none;
      font-size: 1.2rem;
      color: #94a3b8;
      cursor: pointer;
      padding: 0 4px;
      flex-shrink: 0;
    }
    
    .toast-close:hover {
      color: #475569;
    }
  `;
  
  document.head.appendChild(style);
}

// ==================== END NOTIFICATION SYSTEM ====================

// MutationObserver for monitoring messages list changes
let messagesObserver = null;

// Track if the admin has manually scrolled up
let userScrolledUp = false;

// Initialize chat interface
function initializeChatInterface() {
  console.log('Setting up chat interface');
  
  // Get the inbox container
  const inboxSection = document.getElementById('section-inbox');
  if (!inboxSection) {
    console.error('Inbox section not found');
    return;
  }
  
  // Create the container directly with HTML
  inboxSection.innerHTML = `
    <div class="live-chat-container">
      <div class="live-chat-title-bar">Inbox</div>
      <div class="live-chat-body">
        <div class="active-chats-sidebar">
          <h3>Active Chats</h3>
          <ul id="activeChatsList" class="active-chats-list">
            <li class="no-chats-message">No active chats</li>
          </ul>
        </div>
        <div class="chat-main-area">
          <div id="chatWindow" class="chat-window">
            <div class="chat-welcome-message">
              <h3>Welcome to Admin Chat Support</h3>
              <p>Select an active chat from the sidebar or wait for new chat requests.</p>
            </div>
          </div>
          <div id="chatControls" class="chat-controls" style="display: none;">
            <form id="chatForm" class="chat-form">
              <textarea id="messageInput" placeholder="Type your message here..." rows="3"></textarea>
              <button type="submit" class="chat-send-button">Send</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Smart scroll helper - only scrolls when appropriate
  window.forceAdminChatScroll = function() {
    const ml = document.getElementById('messagesList');
    if (ml) ml.scrollTop = ml.scrollHeight;
  };
  
  // Get references to key elements
  chatContainer = document.querySelector('.live-chat-container');
  activeChatsList = document.getElementById('activeChatsList');
  chatWindow = document.getElementById('chatWindow');
  chatForm = document.getElementById('chatForm');
  messageInput = document.getElementById('messageInput');
  chatControls = document.getElementById('chatControls');
  
  // Set up event listeners
  setupEventListeners();
  
  // Load active chats from Firebase
  loadActiveChats();
}

// Flag to prevent duplicate message submissions
let isSubmitting = false;

// Add event listeners
function setupEventListeners() {
  // Remove any existing event listeners first to prevent duplicates
  chatForm.removeEventListener('submit', handleFormSubmit);
  messageInput.removeEventListener('keydown', handleKeyDown);

  // Add the event listeners with named functions
  chatForm.addEventListener('submit', handleFormSubmit);
  messageInput.addEventListener('keydown', handleKeyDown);
  
  console.log('Event listeners initialized');
}

// Handle form submission
function handleFormSubmit(e) {
  e.preventDefault();
  sendMessageIfValid();
}

// Handle keydown event
function handleKeyDown(e) {
  // Only handle Enter without Shift
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); // Prevent new line
    sendMessageIfValid();
  }
}


// Common function to send message if valid
function sendMessageIfValid() {
  // Prevent duplicate submissions
  if (isSubmitting) {
    console.log('Preventing duplicate message');
    return;
  }
  
  const messageText = messageInput.value.trim();
  if (messageText && activeChatId) {
    // Set flag to prevent duplicates
    isSubmitting = true;
    
    // Send the message
    sendMessage(activeChatId, messageText, 'admin');
    messageInput.value = '';
    
    // Always scroll to bottom after sending own message
    userScrolledUp = false;
    setTimeout(() => scrollToBottom(), 100);
    
    // Reset flag after a short delay
    setTimeout(() => {
      isSubmitting = false;
    }, 300);
  }
}

// Load active chats from Firebase
function loadActiveChats() {
  if (!window.firebase?.firestore) {
    showError('Firebase not available');
    return;
  }
  
  const db = firebase.firestore();
  
  // Listen for active chats - only show truly new sessions
  db.collection(CHAT_COLLECTION)
    .where('active', '==', true)
    .where('isNewSession', '==', true) // Only show chats that are marked as new sessions
    .onSnapshot((snapshot) => {
      handleActiveChatsUpdate(snapshot);
    }, (error) => {
      console.error('Error loading active chats:', error);
      showError('Failed to load active chats');
    });
}

// Handle updates to active chats
function handleActiveChatsUpdate(snapshot) {
  currentChats = [];
  let hasChats = false;
  
  snapshot.forEach((doc) => {
    const chat = {
      id: doc.id,
      ...doc.data()
    };
    currentChats.push(chat);
    hasChats = true;
  });
  
  // Update UI
  updateActiveChatsUI(hasChats);
  
  // Set up idle timers for each chat
  currentChats.forEach(chat => {
    setupIdleTimer(chat.id);
  });
}

// ── Mobile messenger helpers ──────────────────────────────────────────────────

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function injectMobileChatHeader(chat) {
  const existing = document.querySelector('.mob-chat-header');
  if (existing) existing.remove();
  if (window.innerWidth > 768) return;

  const header = document.createElement('div');
  header.className = 'mob-chat-header';
  const name = chat?.userName || 'Chat';
  header.innerHTML = `
    <button class="mob-back-btn" aria-label="Back">&#8592;</button>
    <div class="mob-header-avatar">${getInitials(name)}</div>
    <div class="mob-header-name">${name}</div>
  `;
  const chatMain = document.querySelector('.chat-main-area');
  if (chatMain) chatMain.insertBefore(header, chatMain.firstChild);
  header.querySelector('.mob-back-btn').addEventListener('click', closeMobileChat);
}

function closeMobileChat() {
  const liveBody = document.querySelector('.live-chat-body');
  if (liveBody) liveBody.classList.remove('mobile-chat-open');
  const header = document.querySelector('.mob-chat-header');
  if (header) header.remove();
}

// ─────────────────────────────────────────────────────────────────────────────

// Update the active chats sidebar
function updateActiveChatsUI(hasChats) {
  if (!hasChats) {
    activeChatsList.innerHTML = `<li class="no-chats-message">No active chats</li>`;
    return;
  }
  
  // Clear current list
  activeChatsList.innerHTML = '';

  // Sort: most recently active first (lastTimestamp, falling back to startTime)
  const getSeconds = (ts) => (ts && ts.seconds) ? ts.seconds : 0;
  const sorted = [...currentChats].sort((a, b) =>
    (getSeconds(b.lastTimestamp) || getSeconds(b.startTime)) -
    (getSeconds(a.lastTimestamp) || getSeconds(a.startTime))
  );

  // Add each chat to the list
  sorted.forEach(chat => {
    const li = document.createElement('li');
    li.className = `chat-item ${activeChatId === chat.id ? 'active' : ''}`;
    li.dataset.chatId = chat.id;
    
    const lastMessage = chat.lastMessage || 'New chat';
    const timestamp = chat.lastTimestamp ? formatTimestamp(chat.lastTimestamp) : '';
    
    const initials = getInitials(chat.userName || '?');
    li.innerHTML = `
      <div class="mob-avatar">${initials}</div>
      <div class="mob-text">
        <div class="mob-row-top">
          <span class="chat-item-user">${chat.userName || 'Unknown User'}</span>
          <span class="mob-time">${timestamp}</span>
        </div>
        <div class="mob-row-bot">
          <span class="mob-preview">${lastMessage}</span>
          ${chat.unreadCount ? `<span class="mob-unread">${chat.unreadCount}</span>` : ''}
        </div>
      </div>
      <button class="chat-delete-btn" title="Remove from inbox" data-chat-id="${chat.id}">×</button>
      ${chat.itemId && chat.itemTitle ? `<div class="chat-item-inquiry chat-item-clickable" data-item-id="${chat.itemId}">📦 ${chat.itemTitle}</div>` : (chat.lostItemId && chat.lostItemTitle ? `<div class="chat-item-inquiry">🔍 ${chat.lostItemTitle}</div>` : '')}
      <div class="chat-item-preview">${lastMessage}</div>
      <div class="chat-item-time">${timestamp}</div>
      ${chat.unreadCount ? `<span class="unread-badge">${chat.unreadCount}</span>` : ''}
    `;

    // Replace email with registered full name — Firestore first, then Cloud Function fallback
    const updateName = (resolvedName) => {
      const nameEl = li.querySelector('.chat-item-user');
      if (nameEl) nameEl.textContent = resolvedName;
      const avatarEl = li.querySelector('.mob-avatar');
      if (avatarEl) avatarEl.textContent = getInitials(resolvedName);
    };
    if (chat.userId) {
      const uid = chat.userId;
      if (resolvedNameCache[uid]) {
        updateName(resolvedNameCache[uid]);
      } else {
        firebase.firestore().collection('users').doc(uid).get()
          .then(u => {
            if (u.exists && u.data().name) {
              resolvedNameCache[uid] = u.data().name;
              updateName(u.data().name);
            } else {
              firebase.functions().httpsCallable('getUserDisplayName')({ uid })
                .then(result => {
                  if (result.data && result.data.name) {
                    resolvedNameCache[uid] = result.data.name;
                    updateName(result.data.name);
                  }
                }).catch(() => {});
            }
          }).catch(() => {});
      }
    }

    // Add click handler for item inquiry link in sidebar
    const inquiryLink = li.querySelector('.chat-item-inquiry[data-item-id]');
    if (inquiryLink && inquiryLink.dataset.itemId) {
      inquiryLink.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't trigger chat selection
        if (typeof showItemDetailsModal === 'function') {
          showItemDetailsModal(inquiryLink.dataset.itemId);
        }
      });
    }
    
    // Delete button — hides chat from inbox without deleting data
    const deleteBtn = li.querySelector('.chat-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        archiveChat(chat.id);
      });
    }

    // Add click handler to select this chat
    li.addEventListener('click', () => selectChat(chat.id));
    
    activeChatsList.appendChild(li);
  });
}

// Archive a chat (hide from inbox; reappears automatically when user sends next message)
function archiveChat(chatId) {
  if (!window.firebase?.firestore) return;
  firebase.firestore().collection(CHAT_COLLECTION).doc(chatId).update({
    isNewSession: false
  }).catch(() => {});

  // Remove from known IDs so the notification fires again when user messages
  knownChatIds.delete(chatId);

  // If this was the open chat, clear the main view
  if (activeChatId === chatId) {
    activeChatId = null;
    stopUserPresenceListener();
    chatControls.style.display = 'none';
    chatWindow.innerHTML = `
      <div class="chat-welcome-message">
        <h3>Welcome to Admin Chat Support</h3>
        <p>Select an active chat from the sidebar or wait for new chat requests.</p>
      </div>`;
  }
}

// ==================== USER PRESENCE (admin view) ====================

function _adminRelativeTime(date) {
  if (!date) return 'a while ago';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

let _userPresenceLastSeen = null;
let _userPresenceIsOnline = false;

function _updateUserPresenceUI() {
  const el = document.getElementById('userPresenceIndicator');
  if (!el) return;
  if (_userPresenceIsOnline) {
    el.innerHTML = '<span class="user-presence-dot online"></span><span class="user-presence-label">Online</span>';
  } else {
    const ago = _adminRelativeTime(_userPresenceLastSeen);
    el.innerHTML = `<span class="user-presence-dot offline"></span><span class="user-presence-label">Last seen ${ago}</span>`;
  }
}

function startUserPresenceListener(userId) {
  stopUserPresenceListener();
  if (!userId || !window.firebase?.firestore) return;

  userPresenceUnsubscribe = firebase.firestore()
    .collection('userPresence').doc(userId)
    .onSnapshot((doc) => {
      if (!doc.exists) {
        _userPresenceIsOnline = false;
        _userPresenceLastSeen = null;
      } else {
        const data = doc.data();
        _userPresenceLastSeen = data.lastSeen ? data.lastSeen.toDate() : null;
        const stale = _userPresenceLastSeen ? (Date.now() - _userPresenceLastSeen.getTime() > 90000) : true;
        _userPresenceIsOnline = data.online === true && !stale;
      }
      _updateUserPresenceUI();
      clearInterval(userPresenceTickInterval);
      if (!_userPresenceIsOnline) {
        userPresenceTickInterval = setInterval(_updateUserPresenceUI, 60000);
      }
    }, () => {
      _userPresenceIsOnline = false;
      _updateUserPresenceUI();
    });
}

function stopUserPresenceListener() {
  if (userPresenceUnsubscribe) {
    userPresenceUnsubscribe();
    userPresenceUnsubscribe = null;
  }
  clearInterval(userPresenceTickInterval);
  userPresenceTickInterval = null;
}

// Select a chat to display
function selectChat(chatId) {
  // Update active chat ID
  activeChatId = chatId;
  currentChatUser = currentChats.find(c => c.id === chatId);
  
  // Update sidebar selection
  document.querySelectorAll('.chat-item').forEach(item => {
    item.classList.toggle('active', item.dataset.chatId === chatId);
  });
  
  // Show chat controls
  chatControls.style.display = '';

  // Mobile: switch to full-screen chat view
  if (window.innerWidth <= 768) {
    const liveBody = document.querySelector('.live-chat-body');
    if (liveBody) liveBody.classList.add('mobile-chat-open');
    injectMobileChatHeader(currentChatUser);
  }

  // Load chat messages
  loadChatMessages(chatId);
  
  // Reset idle timer
  resetIdleTimer(chatId);
  
  // Force window resizing to trigger proper layout recalculation
  const triggerResize = () => {
    window.dispatchEvent(new Event('resize'));
    
    // Focus on message input to ensure keyboard is ready
    if (messageInput) {
      setTimeout(() => {
        messageInput.focus();
      }, 200);
    }
  };
  
  // Execute resize triggering multiple times with delays
  triggerResize();
  setTimeout(triggerResize, 300);
  setTimeout(triggerResize, 1000);
  
  // Disconnect any existing message observer
  if (messagesObserver) {
    messagesObserver.disconnect();
  }
  
  // Mark as read in Firebase
  if (window.firebase?.firestore) {
    firebase.firestore().collection(CHAT_COLLECTION).doc(chatId).update({
      unreadCount: 0
    }).catch(error => {
      console.error('Error updating unread count:', error);
    });
  }
}

// Load messages for a specific chat
function loadChatMessages(chatId) {
  if (!window.firebase?.firestore) {
    showError('Firebase not available');
    return;
  }
  
  // Clear current messages
  chatWindow.innerHTML = '<div class="chat-loading">Loading messages...</div>';
  
  const db = firebase.firestore();
  
  // Get user info for this chat
  db.collection(CHAT_COLLECTION).doc(chatId).get()
    .then(doc => {
      if (doc.exists) {
        const chatData = doc.data();
        
        // Build initial chat header
        chatWindow.innerHTML = `
          <div class="chat-user-info">
            <div class="chat-user-name-row">
              <div class="chat-user-name" id="chatDisplayName">${chatData.userName || 'Unknown User'}</div>
              <div id="userPresenceIndicator" class="user-presence-indicator">
                <span class="user-presence-dot offline"></span><span class="user-presence-label">Checking…</span>
              </div>
            </div>
            <div class="chat-user-email">${chatData.userEmail || 'No email provided'}</div>
            <div class="chat-start-time">Started: ${formatTimestamp(chatData.startTime)}</div>
            <div id="chatItemContext"></div>
          </div>
          <div id="messagesList" class="messages-list"></div>
        `;

        // Start listening to user presence
        startUserPresenceListener(chatData.userId);

        // Replace with registered full name — Firestore first, then Cloud Function fallback
        if (chatData.userId) {
          const uid = chatData.userId;
          if (resolvedNameCache[uid]) {
            const nameEl = document.getElementById('chatDisplayName');
            if (nameEl) nameEl.textContent = resolvedNameCache[uid];
          } else {
            db.collection('users').doc(uid).get()
              .then(u => {
                if (u.exists && u.data().name) {
                  resolvedNameCache[uid] = u.data().name;
                  const nameEl = document.getElementById('chatDisplayName');
                  if (nameEl) nameEl.textContent = u.data().name;
                } else {
                  firebase.functions().httpsCallable('getUserDisplayName')({ uid })
                    .then(result => {
                      if (result.data && result.data.name) {
                        resolvedNameCache[uid] = result.data.name;
                        const nameEl = document.getElementById('chatDisplayName');
                        if (nameEl) nameEl.textContent = result.data.name;
                      }
                    }).catch(() => {});
                }
              }).catch(() => {});
          }
        }

        // If chat has found-item context, fetch from items collection
        if (chatData.itemId) {
          const itemContextEl = document.getElementById('chatItemContext');
          firebase.firestore().collection('items').doc(chatData.itemId).get()
            .then(itemDoc => {
              if (itemDoc.exists) {
                const itemData = itemDoc.data();
                const itemTitle = chatData.itemTitle || itemData.title || 'Unknown Item';
                const itemImage = itemData.image || '';
                itemContextEl.innerHTML = `
                  <div class="chat-item-context chat-item-clickable" data-item-id="${chatData.itemId}">
                    ${itemImage ? `<img src="${itemImage}" alt="${itemTitle}" class="chat-item-thumb">` : ''}
                    <div class="chat-item-details">
                      <div class="chat-item-label">Inquiring about:</div>
                      <div class="chat-item-name">${itemTitle}</div>
                      <div class="chat-item-view-hint">Click to view details</div>
                    </div>
                  </div>`;
                itemContextEl.querySelector('.chat-item-clickable').addEventListener('click', function() {
                  if (typeof showItemDetailsModal === 'function') showItemDetailsModal(chatData.itemId);
                });
              }
            })
            .catch(err => console.log('Could not fetch item details:', err));
        }

        // If chat is about a reported lost item, fetch from lostItems collection
        if (chatData.lostItemId && !chatData.itemId) {
          const itemContextEl = document.getElementById('chatItemContext');
          firebase.firestore().collection('lostItems').doc(chatData.lostItemId).get()
            .then(itemDoc => {
              const itemTitle = chatData.lostItemTitle || (itemDoc.exists ? itemDoc.data().title : '') || 'Lost Item';
              const itemImage = itemDoc.exists ? (itemDoc.data().image || '') : '';
              itemContextEl.innerHTML = `
                <div class="chat-item-context">
                  ${itemImage ? `<img src="${itemImage}" alt="${itemTitle}" class="chat-item-thumb">` : ''}
                  <div class="chat-item-details">
                    <div class="chat-item-label">Reported Lost Item:</div>
                    <div class="chat-item-name">${itemTitle}</div>
                  </div>
                </div>`;
            })
            .catch(() => {});
        }
        
        messagesList = document.getElementById('messagesList');
        
        // Reset scroll tracking for new chat
        userScrolledUp = false;
        
        // Track manual scrolling - if user scrolls up, stop auto-scrolling
        if (messagesList) {
          messagesList.addEventListener('scroll', function() {
            const distFromBottom = this.scrollHeight - this.scrollTop - this.clientHeight;
            if (distFromBottom > 200) {
              userScrolledUp = true;
            } else {
              userScrolledUp = false;
            }
          });
        }
        
        // Set up MutationObserver to detect when messages are added and force scroll
        if (messagesList) {
          // Disconnect any existing observer
          if (messagesObserver) {
            messagesObserver.disconnect();
          }
          
          // Create a new observer - no longer auto-scrolls on every mutation
          // Scrolling is handled explicitly when new messages arrive
          messagesObserver = new MutationObserver((mutations) => {
            // Do nothing - scroll is handled by handleMessagesUpdate
          });
          
          // Start observing
          messagesObserver.observe(messagesList, {
            childList: true,      // Watch for changes to child elements
            subtree: true,        // Watch the entire subtree
            characterData: false  // Don't need to watch for character data changes
          });
          console.log('MutationObserver attached to messages list');
        }
        
        // Tear down any previous messages listener before opening a new one —
        // without this, re-selecting the same chat stacks listeners and doubles every message.
        if (_messagesUnsubscribe) {
          _messagesUnsubscribe();
          _messagesUnsubscribe = null;
        }

        // Set up real-time listener for messages
        _messagesUnsubscribe = db.collection(CHAT_COLLECTION).doc(chatId)
          .collection(CHAT_MESSAGES_COLLECTION)
          .orderBy('timestamp', 'asc')
          .onSnapshot((snapshot) => {
            handleMessagesUpdate(snapshot);
          }, (error) => {
            console.error('Error listening to messages:', error);
            messagesList.innerHTML += `<div class="system-message error">Error loading messages: ${error.message}</div>`;
          });
      } else {
        chatWindow.innerHTML = '<div class="chat-error">Chat not found</div>';
      }
    })
    .catch(error => {
      console.error('Error getting chat details:', error);
      chatWindow.innerHTML = `<div class="chat-error">Error: ${error.message}</div>`;
    });
}

// Handle updates to messages
function handleMessagesUpdate(snapshot) {
  let addedMessages = false;
  
  snapshot.docChanges().forEach(change => {
    if (change.type === 'added') {
      const message = change.doc.data();
      addMessageToUI(message);
      addedMessages = true;
    }
  });
  
  // Only scroll if the admin hasn't manually scrolled up
  if (addedMessages && messagesList) {
    if (!userScrolledUp) {
      setTimeout(() => scrollToBottom(), 50);
    }
    
    // Reset idle timer
    resetIdleTimer(activeChatId);
  }
}

// Add a message to the UI
function addMessageToUI(message) {
  if (!messagesList) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${message.sender === 'admin' ? 'admin-message' : 'user-message'}`;
  
  const timestamp = formatTimestamp(message.timestamp);
  
  let contentHTML = '';
  if (message.imageUrl) {
    contentHTML += `<img src="${message.imageUrl}" alt="Shared image" style="cursor:zoom-in;" onclick="_showChatImageLightbox(this.src)">`;
  }
  if (message.text) {
    contentHTML += `<div class="message-content">${message.text}</div>`;
  }
  if (!message.text && !message.imageUrl) {
    contentHTML += `<div class="message-content">(empty)</div>`;
  }
  
  messageDiv.innerHTML = `
    ${contentHTML}
    ${timestamp ? `<span class="message-time">${timestamp}</span>` : ''}
  `;
  
  messagesList.appendChild(messageDiv);
  // Scrolling is handled by handleMessagesUpdate (respects user's scroll position)
}

// Lightbox for chat images — shows image in an overlay instead of opening a new tab
function _showChatImageLightbox(src) {
  if (!src) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.85);z-index:99999;
    display:flex;align-items:center;justify-content:center;cursor:zoom-out;
  `;
  const img = document.createElement('img');
  img.src = src;
  img.style.cssText = `
    max-width:90vw;max-height:90vh;object-fit:contain;
    border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.5);
    cursor:default;
  `;
  img.addEventListener('click', e => e.stopPropagation());
  overlay.appendChild(img);
  overlay.addEventListener('click', () => overlay.remove());
  document.addEventListener('keydown', function _esc(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', _esc); }
  });
  document.body.appendChild(overlay);
}

// Send a message
function sendMessage(chatId, messageText, sender) {
  if (!window.firebase?.firestore) {
    showError('Firebase not available');
    return;
  }
  
  const db = firebase.firestore();
  const timestamp = firebase.firestore.FieldValue.serverTimestamp();
  
  // Add message to the chat
  db.collection(CHAT_COLLECTION).doc(chatId)
    .collection(CHAT_MESSAGES_COLLECTION)
    .add({
      text: messageText,
      sender: sender,
      timestamp: timestamp
    })
    .then(() => {
      // Update the chat document with last message info
      return db.collection(CHAT_COLLECTION).doc(chatId).update({
        lastMessage: messageText,
        lastTimestamp: timestamp,
        lastSender: sender,
        unreadCount: firebase.firestore.FieldValue.increment(sender === 'admin' ? 0 : 1),
        userHidden: firebase.firestore.FieldValue.delete(),
        userHiddenAt: firebase.firestore.FieldValue.delete()
      });
    })
    .catch(error => {
      console.error('Error sending message:', error);
      showError('Failed to send message');
    });
}


// Idle auto-end removed — chats stay open until manually managed
function setupIdleTimer(chatId) {}
function resetIdleTimer(chatId) {}
function handleIdleTimeout(chatId) {}

// Format a timestamp for display
function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  
  try {
    let date;
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      // Firebase Timestamp
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      // Firebase Timestamp object
      date = new Date(timestamp.seconds * 1000);
    } else {
      // Regular Date or string
      date = new Date(timestamp);
    }
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return '';
    }
    
    // Format the date
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    } else {
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    }
  } catch (e) {
    console.error('Error formatting timestamp:', e);
    return '';
  }
}

// Show an error message
function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'chat-error';
  errorDiv.textContent = message;
  
  chatWindow.appendChild(errorDiv);
  
  // Remove after 5 seconds
  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}

// Scroll chat window to bottom
function scrollToBottom() {
  if (!messagesList) return;
  messagesList.scrollTop = messagesList.scrollHeight;
}

// Add chat styles to the document
function addChatStyles() {
  if (document.getElementById('admin-chat-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'admin-chat-styles';
  style.textContent = `
    .live-chat-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: #fff;
      overflow: hidden;
    }

    .live-chat-title-bar {
      padding: 0.85rem 1.5rem;
      font-size: 1.5rem;
      font-weight: 600;
      color: #1e293b;
      background: #fff;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
    }

    .live-chat-body {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .active-chats-sidebar {
      width: 300px;
      border-right: 1px solid #e5e7eb;
      background-color: #f9fafb;
      overflow-y: auto;
    }
    
    .active-chats-sidebar h3 {
      padding: 1rem;
      margin: 0;
      border-bottom: 1px solid #e5e7eb;
      font-size: 1rem;
      color: #374151;
    }
    
    .active-chats-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .chat-item {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid #e5e7eb;
      cursor: pointer;
      transition: all 0.2s ease-in-out;
      position: relative;
      display: flex;
      flex-direction: column;
    }
    
    .chat-item:hover {
      background-color: #f3f4f6;
      transform: translateX(5px);
      box-shadow: -3px 0 0 #f07316;
    }
    
    .chat-item.active {
      background-color: #ffedd5;
      border-left: 4px solid #1a2e6b;
      box-shadow: 0 2px 4px rgba(26, 46, 107, 0.1);
    }
    
    .chat-item-user {
      font-weight: 700;
      color: #2a4599;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      font-size: 1rem;
    }
    
    .chat-item-user:before {
      content: '👤';
      margin-right: 0.5rem;
      font-size: 1.1rem;
    }
    
    .chat-item-preview {
      font-size: 0.875rem;
      color: #4b5563;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 0.5rem;
      padding-left: 1.5rem;
      position: relative;
      font-style: italic;
    }
    
    .chat-item-preview:before {
      content: '💬';
      position: absolute;
      left: 0;
      font-size: 0.875rem;
      opacity: 0.7;
    }
    
    /* Desktop: hide mobile-messenger elements */
    .mob-avatar { display: none; }
    .mob-text   { display: contents; }
    .mob-row-top, .mob-row-bot { display: contents; }
    .mob-time, .mob-preview, .mob-unread { display: none; }
    .mob-chat-header { display: none; }

    .chat-item-time {
      font-size: 0.75rem;
      color: #6b7280;
      text-align: right;
      margin-left: auto;
      background-color: #f1f5f9;
      padding: 0.25rem 0.5rem;
      border-radius: 12px;
      font-weight: 500;
    }
    
    .chat-item.active .chat-item-user,
    .chat-item.active .chat-item-preview {
      color: #1a2e6b;
    }
    
    .no-chats-message {
      padding: 1.5rem;
      color: #6b7280;
      text-align: center;
      font-style: italic;
    }
    
    .chat-main-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      background-color: #fff;
    }
    
    .chat-window {
      flex: 1;
      padding: 1rem;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      background-color: #f9fafb;
      display: flex !important;
      flex-direction: column !important;
      height: 100% !important;
    }
    
    .messages-list {
      display: flex !important;
      flex-direction: column !important;
      gap: 0.75rem !important;
      flex: 1 !important;
      overflow-y: scroll !important; /* Force scroll always */
      flex: 1 1 0 !important;
      min-height: 0 !important;
      padding-bottom: 60px !important; /* Extra padding at bottom */
      scroll-behavior: smooth !important;
      position: relative !important;
      z-index: 100 !important;
      margin-bottom: 20px !important;
    }
    
    /* Force chat messages to display properly */
    .chat-message {
      display: flex !important;
      flex-direction: column !important;
      visibility: visible !important;
      opacity: 1 !important;
      position: relative !important;
      z-index: auto !important;
      min-height: auto !important;
      overflow: visible !important;
      padding: 12px 16px !important;
      font-size: 15px !important;
      line-height: 1.5 !important;
    }
    
    .chat-welcome-message {
      text-align: center;
      padding: 3rem 1rem;
      color: #6b7280;
    }
    
    .chat-welcome-message h3 {
      margin-top: 0;
      margin-bottom: 1rem;
      color: #1f2937;
    }
    
    .chat-user-info {
      background-color: #ffedd5;
      padding: 1.25rem;
      margin-bottom: 1.5rem;
      border-radius: 8px;
      border-left: 4px solid #1a2e6b;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    }
    
    .chat-user-name-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
    }

    .chat-user-name {
      font-weight: 700;
      font-size: 1.25rem;
      color: #2a4599;
      margin-bottom: 0;
    }

    .user-presence-indicator {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .user-presence-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }

    .user-presence-dot.online {
      background-color: #22c55e;
      box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25);
    }

    .user-presence-dot.offline {
      background-color: #9ca3af;
    }

    .user-presence-label {
      font-size: 0.75rem;
      color: #f07316;
      font-weight: 500;
    }

    .chat-user-email {
      color: #f07316;
      margin-bottom: 0.75rem;
      font-size: 1rem;
      display: flex;
      align-items: center;
    }
    
    .chat-user-email:before {
      content: '✉️';
      margin-right: 0.5rem;
    }
    
    .chat-start-time {
      font-size: 0.85rem;
      color: #4b5563;
      display: flex;
      align-items: center;
      border-top: 1px solid rgba(26, 46, 107, 0.2);
      padding-top: 0.75rem;
      margin-top: 0.75rem;
    }
    
    .chat-start-time:before {
      content: '🕒';
      margin-right: 0.5rem;
    }
    
    .chat-item-context {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid rgba(26, 46, 107, 0.2);
      background: rgba(255, 255, 255, 0.5);
      border-radius: 6px;
      padding: 0.6rem;
    }
    
    .chat-item-thumb {
      width: 56px;
      height: 56px;
      object-fit: cover;
      border-radius: 6px;
      border: 2px solid #fed7aa;
      flex-shrink: 0;
    }
    
    .chat-item-details {
      flex: 1;
      min-width: 0;
    }
    
    .chat-item-label {
      font-size: 0.7rem;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 2px;
    }
    
    .chat-item-name {
      font-weight: 600;
      font-size: 0.95rem;
      color: #1e3a5f;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .chat-item-inquiry {
      font-size: 0.75rem;
      color: #4b5563;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .chat-item-clickable {
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .chat-item-clickable:hover {
      background: rgba(26, 46, 107, 0.1);
      border-radius: 6px;
    }
    
    .chat-item-inquiry.chat-item-clickable:hover {
      color: #1a2e6b;
      text-decoration: underline;
    }
    
    .chat-item-view-hint {
      font-size: 0.65rem;
      color: #93a3b8;
      margin-top: 2px;
      font-style: italic;
    }
    
    .chat-item-clickable:hover .chat-item-view-hint {
      color: #1a2e6b;
    }
    
    .messages-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    
    .chat-message {
      max-width: 75% !important;
      min-width: 140px !important;
      padding: 12px 16px !important;
      border-radius: 12px !important;
      position: relative !important;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1) !important;
      margin-bottom: 0 !important;
      font-size: 15px !important;
      line-height: 1.5 !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: visible !important;
      word-break: break-word !important;
    }
    
    .chat-message img {
      max-width: 100% !important;
      max-height: 200px !important;
      height: auto !important;
      border-radius: 6px !important;
      display: block !important;
      margin-bottom: 8px !important;
      cursor: pointer !important;
    }
    
    .user-message {
      align-self: flex-start !important;
      background-color: #f3f4f6 !important;
      border-radius: 8px !important;
      color: #1f2937 !important;
    }
    
    .admin-message {
      align-self: flex-end !important;
      background-color: #1a2e6b !important;
      border-radius: 8px !important;
      color: #ffffff !important;
    }
    
    .system-message {
      align-self: center;
      background-color: #f8fafc;
      color: #64748b;
      font-style: italic;
      font-size: 0.875rem;
      padding: 0.5rem 1rem;
      border-radius: 16px;
      border: 1px dashed #cbd5e1;
    }
    
    .system-message.error {
      background-color: #fee2e2;
      color: #b91c1c;
    }
    
    .message-content {
      word-wrap: break-word !important;
      font-size: 15px !important;
      line-height: 1.5 !important;
    }
    
    .admin-message .message-time {
      color: rgba(255, 255, 255, 0.6) !important;
    }
    
    .message-time {
      font-size: 11px !important;
      color: #9ca3af !important;
      text-align: right !important;
      margin-top: 4px !important;
      font-weight: 400 !important;
      display: block !important;
      background-color: transparent !important;
      padding: 0 !important;
      border-radius: 0 !important;
      width: fit-content;
      margin-left: auto;
    }
    
    .chat-controls {
      padding: 1rem;
      border-top: 1px solid #e5e7eb;
      background-color: #fff;
    }
    
    .chat-form {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    
    .chat-form textarea {
      flex: 1;
      resize: none;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-family: inherit;
      font-size: 0.875rem;
    }
    
    .chat-send-button {
      align-self: flex-end;
      background-color: #1a2e6b;
      color: #fff;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
    }
    
    .chat-send-button:hover {
      background-color: #1a2e6b;
    }
    
    .end-chat-button {
      width: 100%;
      background-color: #ef4444;
      color: #fff;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
    }
    
    .end-chat-button:hover {
      background-color: #dc2626;
    }
    
    .unread-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      background-color: #ef4444;
      color: #fff;
      font-size: 0.75rem;
      font-weight: 600;
      min-width: 1.5rem;
      height: 1.5rem;
      border-radius: 50%;
      padding: 0 0.25rem;
    }

    .chat-delete-btn {
      position: absolute;
      top: 0.35rem;
      right: 0.35rem;
      background: none;
      border: none;
      color: #9ca3af;
      font-size: 1.1rem;
      line-height: 1;
      padding: 2px 6px;
      border-radius: 4px;
      cursor: pointer;
      display: none;
      z-index: 2;
    }

    .chat-item:hover .chat-delete-btn {
      display: block;
    }

    .chat-item:hover .unread-badge {
      display: none;
    }

    .chat-delete-btn:hover {
      background-color: #fee2e2;
      color: #ef4444;
    }
    
    .chat-loading {
      text-align: center;
      padding: 1rem;
      color: #6b7280;
    }
    
    .chat-error {
      background-color: #fee2e2;
      color: #b91c1c;
      padding: 0.75rem 1rem;
      margin: 0.5rem 0;
      border-radius: 6px;
      font-size: 0.875rem;
    }

    @media (max-width: 768px) {
      /* ── Hide title bar ── */
      .live-chat-title-bar { display: none !important; }

      /* ── Two-view switcher ── */
      .live-chat-body { flex-direction: column !important; overflow: hidden !important; }

      /* Default: chat list fills the screen */
      .active-chats-sidebar {
        width: 100% !important;
        flex: 1 !important;
        height: auto !important;
        max-height: none !important;
        min-height: 0 !important;
        border-right: none !important;
        overflow-y: auto !important;
        background: #fff !important;
      }
      .chat-main-area { display: none !important; }

      /* When a chat is open: hide list, show chat full-screen */
      .live-chat-body.mobile-chat-open .active-chats-sidebar { display: none !important; }
      .live-chat-body.mobile-chat-open .chat-main-area {
        display: flex !important;
        flex: 1 !important;
        min-height: 0 !important;
        flex-direction: column !important;
        overflow: hidden !important;
      }

      /* ── Chat list header — indent past the floating hamburger ── */
      .active-chats-sidebar h3 {
        padding: 0.85rem 1.25rem 0.85rem 60px !important;
        font-size: 1.25rem !important;
        font-weight: 700 !important;
        color: #111 !important;
        letter-spacing: normal !important;
        text-transform: none !important;
        display: block !important;
        border-bottom: 1px solid #e5e7eb !important;
        margin: 0 !important;
      }

      /* ── Messenger-style list items ── */
      .chat-item {
        flex-direction: row !important;
        align-items: center !important;
        gap: 0.75rem !important;
        padding: 0.75rem 1rem !important;
        border-bottom: 1px solid #f0f2f5 !important;
        border-left: none !important;
        border-radius: 0 !important;
        background: #fff !important;
        transform: none !important;
        box-shadow: none !important;
        position: relative !important;
      }
      .chat-item:hover {
        background: #f5f5f5 !important;
        transform: none !important;
        box-shadow: none !important;
      }
      .chat-item.active { background: #eef0f8 !important; border-left: none !important; box-shadow: none !important; }

      /* ── Avatar ── */
      .mob-avatar {
        width: 46px !important; height: 46px !important;
        border-radius: 50% !important;
        background: #1a2e6b !important;
        color: #fff !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 1rem !important;
        font-weight: 700 !important;
        flex-shrink: 0 !important;
        line-height: 1 !important;
      }

      /* ── Text block ── */
      .mob-text {
        display: flex !important;
        flex-direction: column !important;
        flex: 1 !important;
        min-width: 0 !important;
        gap: 0.1rem !important;
      }
      .mob-row-top {
        display: flex !important;
        align-items: baseline !important;
        gap: 0.5rem !important;
      }
      .mob-row-bot {
        display: flex !important;
        align-items: center !important;
        gap: 0.4rem !important;
        min-width: 0 !important;
      }

      /* Name */
      .chat-item-user {
        font-size: 0.92rem !important;
        font-weight: 600 !important;
        color: #111 !important;
        margin: 0 !important;
        flex: 1 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        display: block !important;
      }
      .chat-item-user:before { display: none !important; }
      .chat-item.active .chat-item-user { color: #111 !important; }

      /* Time (top-right) */
      .mob-time {
        font-size: 0.7rem !important;
        color: #65676b !important;
        flex-shrink: 0 !important;
        white-space: nowrap !important;
        display: block !important;
      }

      /* Preview (bottom-left, truncated) */
      .mob-preview {
        font-size: 0.8rem !important;
        color: #65676b !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        flex: 1 !important;
        display: block !important;
      }

      /* Unread badge (bottom-right) */
      .mob-unread {
        min-width: 18px !important; height: 18px !important;
        border-radius: 9999px !important;
        background: #f07316 !important;
        color: #fff !important;
        font-size: 0.65rem !important;
        font-weight: 700 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 4px !important;
        flex-shrink: 0 !important;
      }

      /* Hide desktop-only elements inside list items */
      .chat-item .chat-item-inquiry,
      .chat-item .chat-item-preview,
      .chat-item .chat-item-time,
      .chat-item .unread-badge,
      .chat-item .chat-delete-btn { display: none !important; }

      /* ── Messenger-style chat header (back + avatar + name) ── */
      .mob-chat-header {
        display: flex !important;
        align-items: center !important;
        gap: 0.65rem !important;
        padding: 0.6rem 0.75rem 0.6rem 60px !important;
        background: #fff !important;
        border-bottom: 1px solid #e5e7eb !important;
        flex-shrink: 0 !important;
      }
      .mob-back-btn {
        background: none !important; border: none !important;
        font-size: 1.5rem !important;
        color: #1a2e6b !important;
        cursor: pointer !important;
        padding: 0.2rem 0.4rem !important;
        line-height: 1 !important;
        flex-shrink: 0 !important;
      }
      .mob-header-avatar {
        width: 36px !important; height: 36px !important;
        border-radius: 50% !important;
        background: #1a2e6b !important;
        color: #fff !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 0.88rem !important;
        font-weight: 700 !important;
        flex-shrink: 0 !important;
      }
      .mob-header-name {
        font-size: 0.95rem !important;
        font-weight: 600 !important;
        color: #111 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        flex: 1 !important;
      }

      /* ── Chat window height fix ── */
      .chat-window {
        flex: 1 !important;
        height: auto !important;
        min-height: 0 !important;
        padding: 0.75rem !important;
      }
      .messages-list {
        flex: 1 !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        padding-bottom: 0.5rem !important;
        margin-bottom: 0 !important;
      }
      /* ── Compact user-info bar ── */
      .chat-user-info {
        display: block !important;
        flex-shrink: 0 !important;
        padding: 0.45rem 0.85rem !important;
        margin-bottom: 0 !important;
        border-radius: 0 !important;
        border-left: 3px solid #1a2e6b !important;
        background: #fef3e2 !important;
        box-shadow: none !important;
      }
      /* Name row: hide name (shown in header), keep presence */
      .chat-user-name-row {
        display: flex !important;
        align-items: center !important;
        gap: 0.4rem !important;
        margin-bottom: 0.2rem !important;
      }
      .chat-user-name { display: none !important; }
      /* Presence indicator — smaller */
      .user-presence-indicator {
        display: flex !important;
        align-items: center !important;
        gap: 4px !important;
      }
      .user-presence-dot {
        width: 8px !important;
        height: 8px !important;
      }
      .user-presence-label {
        font-size: 0.75rem !important;
        color: #6b7280 !important;
      }
      /* Email + start time on one line */
      .chat-user-email,
      .chat-start-time {
        font-size: 0.78rem !important;
        color: #6b7280 !important;
        margin: 0 !important;
        display: inline !important;
      }
      .chat-start-time::before { content: ' · '; }
      /* Item context inline */
      .chat-item-context {
        display: inline-flex !important;
        align-items: center !important;
        gap: 0.3rem !important;
        padding: 0 !important;
        margin: 0 !important;
        background: none !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
      }
      .chat-item-context::before { content: ' · '; font-size: 0.78rem; color: #6b7280; }
      .chat-item-thumb {
        width: 18px !important;
        height: 18px !important;
        border-radius: 3px !important;
        object-fit: cover !important;
      }
      .chat-item-label { display: none !important; }
      .chat-item-name { font-size: 0.78rem !important; font-weight: 600 !important; color: #374151 !important; }
      .chat-item-view-hint { display: none !important; }
      /* Separate the info bar from the chat messages */
      .chat-user-info {
        border-bottom: 1px solid #e5e7eb !important;
        margin-bottom: 0.75rem !important;
      }

      .chat-controls { padding: 0.5rem 0.75rem !important; flex-shrink: 0 !important; }
      .chat-form { margin-bottom: 0 !important; }
    }
  `;
  
  document.head.appendChild(style);
}
