/**
 * User Live Chat Implementation
 * Provides the user-facing chat interface with required details collection
 */

// Configuration
const CHAT_COLLECTION = 'liveChats';
const CHAT_MESSAGES_COLLECTION = 'messages';
const IDLE_TIMEOUT = 3 * 60 * 1000; // 3 minutes in milliseconds

// EmailJS Configuration
const EMAILJS_PUBLIC_KEY = 'htcONvQFGnnjNMtOf';
const EMAILJS_SERVICE_ID = 'service_rvn1rn4';
const EMAILJS_TEMPLATE_ID = 'template_twn4j4h';

// Email verification state
let verificationCode = null;
let verificationExpiry = null;
let lastCodeSentAt = 0;
const CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const CODE_COOLDOWN_MS = 30 * 1000; // 30 seconds between sends

// Chat state
let userChatId = null;
let currentChatItemId = null; // itemId of the currently active chat session
let userInfo = null;
let idleTimer = null;
let messagesUnsubscribe = null;
let statusUnsubscribe = null;

// DOM Elements - will be initialized when needed
// chatButton has been removed
let chatWidget;
let chatContent;
let messagesList;
let chatForm;
let messageInput;
let userDetailForm;

// Initialize chat system when the page loads
document.addEventListener('DOMContentLoaded', function() {
  console.log('Initializing user chat system');
  
  // Add chat styles
  addChatStyles();
  
  // Create chat widget HTML
  createChatWidget();
  
  // Initialize references to DOM elements
  // chatButton reference removed
  chatWidget = document.getElementById('chatWidget');
  chatContent = document.getElementById('chatContent');
  chatForm = document.getElementById('chatForm');
  messageInput = document.getElementById('messageInput');
  userDetailForm = document.getElementById('userDetailForm');
  
  // Set up event listeners
  setupEventListeners();
});

// Create the chat widget HTML
function createChatWidget() {
  // Chat button has been removed to clean up the UI
  // The chat widget will only be accessible through dedicated buttons on item pages
  
  // Create chat widget
  const widget = document.createElement('div');
  widget.id = 'chatWidget';
  widget.className = 'chat-widget';
  widget.style.display = 'none';
  
  // Create the chat header
  const header = document.createElement('div');
  header.className = 'chat-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'chat-title-wrap';

  const title = document.createElement('div');
  title.className = 'chat-title';
  title.textContent = 'Live Support';

  const statusLine = document.createElement('div');
  statusLine.className = 'admin-presence';
  statusLine.id = 'adminPresenceIndicator';
  statusLine.innerHTML = '<span class="presence-dot offline"></span><span class="presence-label">Checking…</span>';

  titleWrap.appendChild(title);
  titleWrap.appendChild(statusLine);

  const controls = document.createElement('div');
  controls.className = 'chat-controls';

  // Removed minimize button - only keeping close button
  const closeButton = document.createElement('button');
  closeButton.id = 'closeChat';
  closeButton.className = 'chat-control-btn close-btn';
  closeButton.textContent = '×';

  // Only append the close button
  controls.appendChild(closeButton);
  header.appendChild(titleWrap);
  header.appendChild(controls);
  widget.appendChild(header);
  
  // Create chat content
  const chatContent = document.createElement('div');
  chatContent.id = 'chatContent';
  chatContent.className = 'chat-content';
  
  // Welcome screen — just a loading indicator; auto-starts once auth user is confirmed
  const welcomeScreen = document.createElement('div');
  welcomeScreen.className = 'welcome-screen';
  welcomeScreen.id = 'chatWelcomeScreen';
  welcomeScreen.innerHTML = '<div class="chat-loading">Connecting…</div>';

  chatContent.appendChild(welcomeScreen);
  widget.appendChild(chatContent);

  // Create chat form container
  const chatFormContainer = document.createElement('div');
  chatFormContainer.id = 'chatFormContainer';
  chatFormContainer.className = 'chat-form-container';
  chatFormContainer.style.display = 'none';
  
  // Create chat form
  const chatForm = document.createElement('form');
  chatForm.id = 'chatForm';
  chatForm.className = 'chat-form';
  
  const messageInput = document.createElement('textarea');
  messageInput.id = 'messageInput';
  messageInput.placeholder = 'Type your message here...';
  messageInput.rows = 2;
  messageInput.required = true;
  
  const sendButton = document.createElement('button');
  sendButton.type = 'submit';
  sendButton.className = 'chat-send-button';
  sendButton.textContent = 'Send';
  
  chatForm.appendChild(messageInput);
  chatForm.appendChild(sendButton);
  chatFormContainer.appendChild(chatForm);
  
  widget.appendChild(chatFormContainer);
  document.body.appendChild(widget);
  
  console.log('Chat widget created with form elements:', {
    nameInput: document.getElementById('userName'),
    emailInput: document.getElementById('userEmail'),
    form: document.getElementById('userDetailForm')
  });
}

// Setup event listeners
function setupEventListeners() {
  // Chat button has been removed
  // Only the dedicated buttons on item pages will open the chat

  // Close button for the chat widget
  document.getElementById('closeChat').addEventListener('click', closeChatWidget);

  // Chat message form submission
  chatForm.addEventListener('submit', function(e) {
    e.preventDefault();

    const messageText = messageInput.value.trim();
    if (messageText && userChatId) {
      sendMessage(messageText);
      messageInput.value = '';
    }
  });

  // Track user activity for idle timeout
  ['click', 'keypress', 'mousemove', 'touchstart'].forEach(eventType => {
    document.addEventListener(eventType, resetIdleTimer);
  });

  _makeChatWidgetInteractive();
}

// Make the chat widget draggable (header) and resizable from all edges/corners
function _makeChatWidgetInteractive() {
  const widget = chatWidget;
  if (!widget) return;
  const header = widget.querySelector('.chat-header');
  if (!header) return;

  const EDGE   = 6;   // px from widget border that counts as an edge hit
  const MIN_W  = 280;
  const MIN_H  = 320;
  const CURSOR = { n:'n-resize', s:'s-resize', e:'e-resize', w:'w-resize',
                   ne:'ne-resize', nw:'nw-resize', se:'se-resize', sw:'sw-resize' };

  let _drag   = null;
  let _resize = null;

  // Override cursor on the widget AND all its children via a style tag —
  // needed so edge cursor wins over e.g. the text-input's cursor.
  function _setCursor(c) {
    let s = document.getElementById('_cw_cur');
    if (!s) { s = document.createElement('style'); s.id = '_cw_cur'; document.head.appendChild(s); }
    s.textContent = c ? `#chatWidget,#chatWidget *{cursor:${c}!important}` : '';
  }

  function _edge(cx, cy) {
    const r  = widget.getBoundingClientRect();
    const x  = cx - r.left;
    const y  = cy - r.top;
    const onN = y <= EDGE;
    const onS = y >= r.height - EDGE;
    const onW = x <= EDGE;
    const onE = x >= r.width  - EDGE;
    if (onN && onW) return 'nw';
    if (onN && onE) return 'ne';
    if (onS && onW) return 'sw';
    if (onS && onE) return 'se';
    if (onN) return 'n';
    if (onS) return 's';
    if (onW) return 'w';
    if (onE) return 'e';
    return null;
  }

  function _inside(cx, cy) {
    const r = widget.getBoundingClientRect();
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  }

  function _lockPosition() {
    const r = widget.getBoundingClientRect();
    widget.style.transform = 'none';
    widget.style.left = r.left + 'px';
    widget.style.top  = r.top  + 'px';
    return r;
  }

  // ── Drag via header ──
  header.style.cursor = 'move';

  header.addEventListener('mousedown', e => {
    if (e.target.closest('button')) return;
    // If the click is on a corner/edge, let the resize handler take it
    if (_edge(e.clientX, e.clientY)) return;
    const r = _lockPosition();
    _drag = { sx: e.clientX, sy: e.clientY, sl: r.left, st: r.top };
    _setCursor('move');
    e.preventDefault();
  });

  // Touch drag
  header.addEventListener('touchstart', e => {
    if (e.target.closest('button')) return;
    const t = e.touches[0];
    const r = _lockPosition();
    _drag = { sx: t.clientX, sy: t.clientY, sl: r.left, st: r.top };
  }, { passive: true });

  // ── Edge resize (mousedown on document so it catches events on child elements) ──
  // Note: no header exclusion here — top corners overlap the header and must resize
  document.addEventListener('mousedown', e => {
    if (_drag) return;
    if (!_inside(e.clientX, e.clientY)) return;
    const dir = _edge(e.clientX, e.clientY);
    if (!dir) return;
    const r = _lockPosition();
    _resize = { dir, sx: e.clientX, sy: e.clientY,
                sl: r.left, st: r.top, sw: r.width, sh: r.height };
    _setCursor(CURSOR[dir]);
    e.preventDefault();
  });

  // ── Shared move ──
  document.addEventListener('mousemove', e => {
    if (_drag) {
      let left = _drag.sl + (e.clientX - _drag.sx);
      let top  = _drag.st + (e.clientY - _drag.sy);
      left = Math.max(0, Math.min(left, window.innerWidth  - widget.offsetWidth));
      top  = Math.max(0, Math.min(top,  window.innerHeight - 40));
      widget.style.left = left + 'px';
      widget.style.top  = top  + 'px';
      return;
    }
    if (_resize) {
      const dx  = e.clientX - _resize.sx;
      const dy  = e.clientY - _resize.sy;
      const dir = _resize.dir;
      let w = _resize.sw, h = _resize.sh, l = _resize.sl, t = _resize.st;

      if (dir.includes('e')) w = Math.max(MIN_W, _resize.sw + dx);
      if (dir.includes('s')) h = Math.max(MIN_H, _resize.sh + dy);
      if (dir.includes('w')) { w = Math.max(MIN_W, _resize.sw - dx); l = _resize.sl + (_resize.sw - w); }
      if (dir.includes('n')) { h = Math.max(MIN_H, _resize.sh - dy); t = _resize.st + (_resize.sh - h); }

      widget.style.width  = w + 'px';
      widget.style.height = h + 'px';
      widget.style.left   = l + 'px';
      widget.style.top    = t + 'px';
      return;
    }

    // Hover: show edge cursor when near border, clear when not
    if (_inside(e.clientX, e.clientY)) {
      const dir = _edge(e.clientX, e.clientY);
      _setCursor(dir ? CURSOR[dir] : null);
    } else {
      _setCursor(null);
    }
  });

  // Touch move (drag only)
  document.addEventListener('touchmove', e => {
    if (!_drag) return;
    const t = e.touches[0];
    let left = _drag.sl + (t.clientX - _drag.sx);
    let top  = _drag.st + (t.clientY - _drag.sy);
    left = Math.max(0, Math.min(left, window.innerWidth  - widget.offsetWidth));
    top  = Math.max(0, Math.min(top,  window.innerHeight - 40));
    widget.style.left = left + 'px';
    widget.style.top  = top  + 'px';
  }, { passive: true });

  // ── Release ──
  document.addEventListener('mouseup',  () => { _drag = null; _resize = null; _setCursor(null); });
  document.addEventListener('touchend', () => { _drag = null; _setCursor(null); });
}

// ==================== ADMIN PRESENCE LISTENER ====================

let presenceUnsubscribe = null;

let _presenceLastSeen = null;
let _presenceIsOnline = false;
let _presenceTickInterval = null;

function _relativeTime(date) {
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

function _updatePresenceIndicator() {
  const indicator = document.getElementById('adminPresenceIndicator');
  if (!indicator) return;
  if (_presenceIsOnline) {
    indicator.innerHTML = '<span class="presence-dot online"></span><span class="presence-label">Online</span>';
  } else {
    const ago = _relativeTime(_presenceLastSeen);
    indicator.innerHTML = `<span class="presence-dot offline"></span><span class="presence-label">Last seen ${ago}</span>`;
  }
}

function startPresenceListener() {
  if (!window.firebase?.firestore) return;
  if (presenceUnsubscribe) return; // already listening

  presenceUnsubscribe = firebase.firestore()
    .collection('adminPresence').doc('status')
    .onSnapshot((doc) => {
      const indicator = document.getElementById('adminPresenceIndicator');
      if (!indicator) return;

      if (!doc.exists) {
        _presenceIsOnline = false;
        _presenceLastSeen = null;
        _updatePresenceIndicator();
        return;
      }

      const data = doc.data();
      _presenceLastSeen = data.lastSeen ? data.lastSeen.toDate() : null;
      const stale = _presenceLastSeen ? (Date.now() - _presenceLastSeen.getTime() > 90000) : true;
      _presenceIsOnline = data.online === true && !stale;

      _updatePresenceIndicator();

      // Tick every minute to keep "X minutes ago" current
      clearInterval(_presenceTickInterval);
      if (!_presenceIsOnline) {
        _presenceTickInterval = setInterval(_updatePresenceIndicator, 60000);
      }
    }, () => {
      _presenceIsOnline = false;
      _updatePresenceIndicator();
    });
}

function stopPresenceListener() {
  if (presenceUnsubscribe) {
    presenceUnsubscribe();
    presenceUnsubscribe = null;
  }
  clearInterval(_presenceTickInterval);
  _presenceTickInterval = null;
}

// ==================== USER PRESENCE (visible to admin) ====================

let _userPresenceHeartbeat = null;
let _userPresenceUid = null;

function _setUserPresence(online) {
  if (!_userPresenceUid || !window.firebase?.firestore) return;
  firebase.firestore().collection('userPresence').doc(_userPresenceUid).set({
    online: online,
    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});
}

function _startUserPresenceHeartbeat(uid) {
  _userPresenceUid = uid;
  if (_userPresenceHeartbeat) return; // already running
  _setUserPresence(true);
  _userPresenceHeartbeat = setInterval(() => _setUserPresence(true), 30000);
}

function _stopUserPresenceHeartbeat() {
  clearInterval(_userPresenceHeartbeat);
  _userPresenceHeartbeat = null;
  _setUserPresence(false);
}

// Toggle chat widget visibility — auto-starts using the logged-in Firebase Auth user
function toggleChatWidget() {
  if (chatWidget.style.display === 'none') {
    chatWidget.style.display = 'flex';

    // Clear unread badge
    const badge = document.getElementById('fcbUnreadBadge');
    if (badge) badge.style.display = 'none';

    // Stamp userLastOpenedAt so unread detection works across page reloads
    if (userChatId && window.firebase?.firestore) {
      firebase.firestore().collection(CHAT_COLLECTION).doc(userChatId).update({
        userLastOpenedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    }

    startPresenceListener();

    if (userChatId && messagesList) {
      // Chat session already running — restart presence heartbeat (may have been
      // stopped when widget was previously closed) and scroll to bottom
      if (userInfo && userInfo.uid) _startUserPresenceHeartbeat(userInfo.uid);
      scrollToBottom();
      return;
    }

    // Fast path: userInfo is already cached from a previous session this page load —
    // skip the onAuthStateChanged + user-doc round-trips and go straight to _doStartChat.
    if (userInfo && userInfo.uid && window.firebase?.firestore) {
      _startUserPresenceHeartbeat(userInfo.uid);
      _doStartChat(firebase.firestore(), userInfo.uid, userInfo.name, userInfo.email);
      return;
    }

    // First open: wait for Firebase Auth to resolve, then fetch user doc.
    if (chatContent) {
      chatContent.innerHTML = '<div class="chat-loading">Connecting…</div>';
    }

    if (!window.firebase || !firebase.auth) {
      chatWidget.style.display = 'none';
      window.location.href = 'login.html';
      return;
    }

    const unsubscribe = firebase.auth().onAuthStateChanged(function(authUser) {
      unsubscribe(); // one-time only
      if (authUser) {
        startChatForUser(authUser);
      } else {
        chatWidget.style.display = 'none';
        window.location.href = 'login.html';
      }
    });
  } else {
    minimizeChatWidget();
  }
}

// Expose the toggleChatWidget function globally
window.toggleChatWidget = toggleChatWidget;

// Called externally (e.g. item Inquire button) to open chat for a specific item.
// lostItemId / lostItemTitle are optional — used when opening a lost-item inquiry thread.
window.openUserChat = function(itemId, itemTitle, lostItemId, lostItemTitle) {
  // Set context on the invisible sentinel button so _doStartChat() can read it
  let btn = document.getElementById('chat-with-staff-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'chat-with-staff-btn';
    btn.style.display = 'none';
    document.body.appendChild(btn);
  }
  btn.dataset.itemId        = itemId        || '';
  btn.dataset.itemTitle     = itemTitle     || '';
  btn.dataset.lostItemId    = lostItemId    || '';
  btn.dataset.lostItemTitle = lostItemTitle || '';

  // Also update item-title element if it exists
  const titleEl = document.getElementById('item-title');
  if (titleEl && itemTitle) titleEl.textContent = itemTitle;

  // If the user is switching to a DIFFERENT item's chat, tear down the current session
  // so toggleChatWidget proceeds to startChatForUser instead of returning early
  const requestedItemId = itemId || lostItemId || null;
  if (userChatId && currentChatItemId !== requestedItemId) {
    _teardownChatSession();
  }

  toggleChatWidget();
};

// Stops active listeners and clears session state so the next toggleChatWidget
// call starts a fresh chat for whatever item is now on the sentinel button.
function _teardownChatSession() {
  if (messagesUnsubscribe) { messagesUnsubscribe(); messagesUnsubscribe = null; }
  if (statusUnsubscribe)   { statusUnsubscribe();   statusUnsubscribe   = null; }
  _stopUserPresenceHeartbeat();
  document.getElementById('chatInquiryCard')?.remove();
  userChatId        = null;
  currentChatItemId = null;
  messagesList      = null;
  // Show loading skeleton immediately — openUserChat already updated button data so
  // _insertInquiryCard can render the new item's card right away (instant UX).
  if (chatContent) chatContent.innerHTML = '<div class="chat-loading">Loading messages…</div>';
  _insertInquiryCard();
  // Hide the widget so the next toggleChatWidget() call opens fresh instead of closing
  if (chatWidget) chatWidget.style.display = 'none';
}

// Minimize chat widget
function minimizeChatWidget() {
  chatWidget.style.display = 'none';
  stopPresenceListener();
  _stopUserPresenceHeartbeat();
}

// Close chat widget — just hides it, chat session stays open in Firestore
function closeChatWidget() {
  chatWidget.style.display = 'none';
  _stopUserPresenceHeartbeat();
}

// Start chat using a Firebase Auth user object — looks up existing chat by userId + itemId
function startChatForUser(authUser) {
  if (!window.firebase?.firestore) {
    showError('Chat service is currently unavailable');
    return;
  }

  const email = authUser.email;
  const uid   = authUser.uid;
  userInfo = { name: authUser.displayName || email, email, uid };
  _startUserPresenceHeartbeat(uid);
  chatContent.innerHTML = '<div class="chat-loading">Starting chat…</div>';

  const db = firebase.firestore();

  // Always resolve the registered name from Firestore first — displayName can lag after registration
  db.collection('users').doc(uid).get()
    .then(userDoc => {
      const name = (userDoc.exists && userDoc.data().name)
        ? userDoc.data().name
        : (authUser.displayName || email);
      userInfo.name = name;
      return _doStartChat(db, uid, name, email);
    })
    .catch(() => _doStartChat(db, uid, authUser.displayName || email, email));
}

function _doStartChat(db, uid, name, email) {
  const chatBtn   = document.getElementById('chat-with-staff-btn');
  let itemId    = (chatBtn && chatBtn.dataset.itemId)    ? chatBtn.dataset.itemId    : null;
  let itemTitle = (chatBtn && chatBtn.dataset.itemTitle) ? chatBtn.dataset.itemTitle : '';
  if (!itemTitle) {
    const titleEl = document.getElementById('item-title');
    if (titleEl) itemTitle = titleEl.textContent.trim();
  }

  // Query only by userId (no composite index needed), then filter itemId in JS
  return db.collection(CHAT_COLLECTION).where('userId', '==', uid).get()
    .then(snapshot => {
      let existingChat = null;
      if (!snapshot.empty) {
        // Filter by itemId in memory, then sort by startTime desc, pick most recent
        const docs = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(d => (d.itemId || null) === (itemId || null))
          .sort((a, b) => ((b.startTime && b.startTime.seconds) || 0) - ((a.startTime && a.startTime.seconds) || 0));
        existingChat = docs[0] || null;
      }
      
      if (existingChat) {
        // RESUME EXISTING CHAT
        console.log('Restoring existing chat:', existingChat.id);
        userChatId        = existingChat.id;
        currentChatItemId = itemId || null;
        
        // Update chat status to active; clear userHidden so it reappears in inbox
        // Stamp userLastOpenedAt so the unread badge clears immediately on open
        window._hiddenChatIds?.delete(userChatId);
        return db.collection(CHAT_COLLECTION).doc(userChatId).update({
          active: true,
          lastResumedTime: firebase.firestore.FieldValue.serverTimestamp(),
          userLastOpenedAt: firebase.firestore.FieldValue.serverTimestamp(),
          endedBy: firebase.firestore.FieldValue.delete(),
          userHidden: firebase.firestore.FieldValue.delete()
        }).then(() => {
          return 'restored';
        });
      } else {
        // CREATE NEW CHAT
        // Create a unique chat ID with timestamp to ensure uniqueness regardless of email
        const uniqueChatId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        userChatId        = uniqueChatId;
        currentChatItemId = itemId || null;
        
        const chatData = {
          userId: uid,
          userName: name,
          userEmail: email,
          startTime: firebase.firestore.FieldValue.serverTimestamp(),
          active: true,
          unreadCount: 0,
          uniqueSessionId: uniqueChatId,
          isNewSession: false,
          itemId: itemId || null
        };

        if (itemId) {
          chatData.itemTitle = itemTitle;
          console.log('Chat includes item context:', chatData.itemTitle, 'itemId:', chatData.itemId);
        }
        
        return db.collection(CHAT_COLLECTION).doc(uniqueChatId).set(chatData).then(() => {
          return 'new';
        });
      }
    })
    .then((status) => {
      console.log('Chat session initialized:', status, 'ID:', userChatId);
      
      // Show chat interface
      initChatInterface();
      
      if (status === 'new') {
        // Add initial system message for new chat
        addSystemMessage('Chat started. An administrator will be with you shortly.');
      } else {
        // Add welcome back message for restored chat
        // Delay slightly to allow Firestore to load existing messages first
        setTimeout(() => {
            addSystemMessage('Chat history restored. You can continue your conversation.');
            scrollToBottom();
        }, 1500);
      }
      
      // Start idle timer
      resetIdleTimer();
    })
    .catch(error => {
      console.error('Error starting chat:', error);
      showError('Failed to start chat session. Please try again.');
      if (chatContent) {
        chatContent.innerHTML = '<div style="padding:1rem;text-align:center"><p style="color:#991b1b;margin-bottom:0.75rem">Failed to connect to chat.</p><button onclick="resetChat()" style="background:#1a2e6b;color:white;border:none;padding:0.5rem 1rem;border-radius:6px;cursor:pointer;font-weight:500">Try Again</button></div>';
      }
    });
}

// Create a new chat input form when needed - using direct HTML injection for maximum compatibility
function createChatInput() {
  console.log('Creating new chat input form inside chat bubble');
  
  // Create the container directly with HTML to match the emergency fix styling
  const containerHTML = `
    <div id="chatFormContainer" style="
      position: absolute !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      width: 100% !important;
      padding: 10px !important;
      background: white !important;
      border-top: 1px solid #e5e7eb !important;
      z-index: 1000 !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      border-radius: 0 0 12px 12px !important;">
        <div id="chatImagePreview" style="
          display: none;
          padding: 4px 8px;
          margin-bottom: 6px;
          position: relative;
          max-width: 100%;
          overflow: hidden;
          box-sizing: border-box;">
        </div>
        <form id="chatForm" style="
          display: flex !important;
          gap: 4px !important;
          width: 100% !important;
          align-items: center !important;">
            <input type="file" id="chatImageInput" accept="image/*" style="display:none !important;">
            <button type="button" id="chatImageBtn" title="Send image" style="
              background: none !important;
              border: 1px solid #d1d5db !important;
              border-radius: 4px !important;
              cursor: pointer !important;
              height: 36px !important;
              width: 36px !important;
              min-width: 36px !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              font-size: 18px !important;
              color: #6b7280 !important;
              padding: 0 !important;">📷</button>
            <input type="text" id="messageInput" placeholder="Type your message here..." style="
              flex: 1 1 0% !important;
              min-width: 0 !important;
              padding: 10px !important;
              border: 2px solid #1a2e6b !important;
              border-radius: 4px !important;
              font-size: 14px !important;
              height: 36px !important;
              width: auto !important;
              background-color: white !important;
              color: black !important;
              box-sizing: border-box !important;
              display: block !important;
              visibility: visible !important;
              opacity: 1 !important;">
            <button type="submit" style="
              background-color: #1a2e6b !important;
              color: white !important;
              border: none !important;
              padding: 5px 15px !important;
              border-radius: 4px !important;
              font-weight: bold !important;
              cursor: pointer !important;
              height: 36px !important;
              width: auto !important;
              min-width: 55px !important;
              max-width: 80px !important;
              flex: 0 0 auto !important;
              text-align: center !important;">Send</button>
        </form>
    </div>
  `;
  
  // Remove any existing chat form
  const existingForm = document.getElementById('chatFormContainer');
  if (existingForm) {
    existingForm.remove();
  }
  
  // Try to append to messagesList's parent container instead of chat widget
  const messagesList = document.getElementById('messagesList');
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = containerHTML;
  const chatFormContainer = tempDiv.firstElementChild;
  
  if (messagesList && messagesList.parentNode) {
    // Insert the form right after the messages list in the chat content
    console.log('Adding chat form inside chat content area');
    messagesList.parentNode.appendChild(chatFormContainer);
  } else {
    // Fallback to adding to chat widget
    console.log('Adding chat form to widget (fallback)');
    chatWidget.appendChild(chatFormContainer);
  }
  
  // Get references to the created elements
  const chatForm = document.getElementById('chatForm');
  const messageInput = document.getElementById('messageInput');
  
  // Ensure the elements exist
  if (!chatForm || !messageInput) {
    console.error('Failed to create chat input elements');
    return { chatFormContainer: null, chatForm: null, messageInput: null };
  }
  
  // Set up image upload button
  const chatImageBtn = document.getElementById('chatImageBtn');
  const chatImageInput = document.getElementById('chatImageInput');
  const chatImagePreview = document.getElementById('chatImagePreview');
  let pendingImage = null;
  
  if (chatImageBtn && chatImageInput) {
    chatImageBtn.addEventListener('click', () => chatImageInput.click());
    
    chatImageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      
      const reader = new FileReader();
      reader.onload = (ev) => {
        pendingImage = { file, dataUrl: ev.target.result };
        chatImagePreview.innerHTML = `
          <div style="position:relative; display:inline-block;">
            <img src="${ev.target.result}" style="max-height:60px; max-width:80px; object-fit:cover; border-radius:4px; border:1px solid #d1d5db;">
            <span id="removeImageBtn" style="
              position:absolute; top:-6px; right:-6px;
              background:#ef4444; color:white; border-radius:50%;
              width:18px; height:18px; font-size:12px;
              display:flex; align-items:center; justify-content:center;
              cursor:pointer; line-height:1;">✕</span>
          </div>`;
        chatImagePreview.style.display = 'block';
        
        document.getElementById('removeImageBtn').addEventListener('click', () => {
          pendingImage = null;
          chatImagePreview.innerHTML = '';
          chatImagePreview.style.display = 'none';
          chatImageInput.value = '';
        });
      };
      reader.readAsDataURL(file);
      chatImageInput.value = '';
    });
  }
  
  // Create a named handler function so we can remove it if needed
  function handleFormSubmit(e) {
    e.preventDefault();
    
    // Prevent duplicate submissions
    if (isSubmitting) {
      console.log('Preventing duplicate message submission');
      return;
    }
    
    const messageText = messageInput.value.trim();
    const hasImage = !!pendingImage;
    
    if ((messageText || hasImage) && userChatId) {
      // Set flag to prevent duplicates
      isSubmitting = true;
      
      if (hasImage) {
        // Upload image to Firebase Storage then send
        const imgToSend = pendingImage;
        pendingImage = null;
        if (chatImagePreview) {
          chatImagePreview.innerHTML = '';
          chatImagePreview.style.display = 'none';
        }
        uploadAndSendImage(imgToSend, messageText).finally(() => {
          isSubmitting = false;
        });
      } else {
        // Send text message
        sendMessage(messageText);
        // Reset flag after a delay
        setTimeout(() => {
          isSubmitting = false;
        }, 1000);
      }
      messageInput.value = '';
    }
  }
  
  // Handle keydown for Enter key
  function handleKeyDown(e) {
    // Check if Enter key was pressed without Shift key (for line breaks)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent default behavior (new line)
      
      // Don't process if already submitting
      if (isSubmitting) {
        console.log('Key press ignored - message already being sent');
        return;
      }
      
      // Trigger the form submission
      handleFormSubmit(new Event('submit'));
    }
  }
  
  // Remove any existing event handlers first
  chatForm.removeEventListener('submit', handleFormSubmit);
  messageInput.removeEventListener('keydown', handleKeyDown);
  
  // Add the event handlers
  chatForm.addEventListener('submit', handleFormSubmit);
  messageInput.addEventListener('keydown', handleKeyDown);
  
  // Force focus on the input
  setTimeout(() => {
    if (messageInput) {
      messageInput.focus();
    }
  }, 100);
  
  return { chatFormContainer, chatForm, messageInput };
}

// Global flags to prevent duplicate submissions
let isSubmitting = false;
let hasKeydownHandler = false;

// Show an item details popup matching the admin modal style exactly
function _showItemDetailsPopup(itemId) {
  if (!itemId || !window.firebase?.firestore) return;

  // Inject styles once — mirrors admin-modal.js rules exactly
  if (!document.getElementById('_uidp-styles')) {
    const s = document.createElement('style');
    s.id = '_uidp-styles';
    s.textContent = `
      ._uidp-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 10001; display: flex; align-items: center; justify-content: center;
      }
      ._uidp-box {
        position: relative; z-index: 2;
        background: #fff; border-radius: 8px; overflow: hidden;
        width: 80%; max-width: 1100px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      }
      ._uidp-x {
        position: absolute; top: 15px; right: 15px;
        width: 30px; height: 30px; background: #fff; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 20px; cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 3;
        border: none; color: #374151;
      }
      ._uidp-x:hover { background: #f1f5f9; }
      ._uidp-body { display: flex; min-height: 400px; }
      ._uidp-img-col {
        width: 40%; background: #f8fafc; padding: 1rem;
        display: flex; align-items: center; justify-content: center;
      }
      ._uidp-img-col img { max-width: 100%; max-height: 400px; object-fit: contain; }
      ._uidp-details-col { width: 60%; padding: 2rem 3rem 2rem 2rem; }
      ._uidp-hd { margin-bottom: 1.5rem; }
      ._uidp-title { font-size: 1.5rem; font-weight: 700; margin: 0 0 0.5rem; color: #0f172a; }
      ._uidp-badge {
        display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px;
        font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
      }
      ._uidp-badge.active  { background: #dcfce7; color: #166534; }
      ._uidp-badge.claimed { background: #ffedd5; color: #2a4599; }
      ._uidp-badge.soon    { background: #fef3c7; color: #92400e; }
      ._uidp-desc { margin-bottom: 1.5rem; }
      ._uidp-desc h3 { font-size: 1rem; font-weight: 600; color: #334155; margin: 0 0 0.5rem; }
      ._uidp-desc p  { margin: 0; line-height: 1.5; color: #334155; }
      ._uidp-rows { margin-bottom: 2rem; }
      ._uidp-row  { display: flex; margin-bottom: 0.75rem; }
      ._uidp-lbl  { font-weight: 600; color: #64748b; width: 140px; flex-shrink: 0; }
      ._uidp-val  { color: #334155; }
      ._uidp-actions { display: flex; justify-content: flex-end; }
      ._uidp-close-btn {
        padding: 0.5rem 1.5rem; background: #f1f5f9; color: #334155;
        border: none; border-radius: 0.375rem; font-weight: 500;
        cursor: pointer; transition: background 0.2s;
      }
      ._uidp-close-btn:hover { background: #e2e8f0; }
      @media (max-width: 768px) {
        ._uidp-body { flex-direction: column; }
        ._uidp-img-col, ._uidp-details-col { width: 100%; }
        ._uidp-details-col { padding: 1.5rem; }
      }
    `;
    document.head.appendChild(s);
  }

  // Show loading overlay immediately
  const overlay = document.createElement('div');
  overlay.className = '_uidp-overlay';
  overlay.innerHTML = `<div class="_uidp-box" style="display:flex;align-items:center;justify-content:center;min-height:200px;">
    <div style="color:#6b7280;font-size:0.95rem;">Loading…</div>
  </div>`;
  document.body.appendChild(overlay);

  const _close = () => { if (overlay.parentElement) overlay.parentElement.removeChild(overlay); };
  overlay.addEventListener('click', e => { if (e.target === overlay) _close(); });
  document.addEventListener('keydown', function _esc(e) {
    if (e.key === 'Escape') { _close(); document.removeEventListener('keydown', _esc); }
  });

  firebase.firestore().collection('items').doc(itemId).get().then(doc => {
    if (!doc.exists) { _close(); return; }
    const d = doc.data();

    let dateStr = 'Unknown';
    if (d.date) { try { dateStr = new Date(d.date).toLocaleDateString(); } catch(e) {} }

    const statusKey   = d.status === 'claimed' ? 'claimed' : d.status === 'soon' ? 'soon' : 'active';
    const statusLabel = statusKey === 'claimed' ? 'Claimed' : statusKey === 'soon' ? 'For Disposal' : 'Active';

    overlay.innerHTML = `
      <div class="_uidp-box">
        <button class="_uidp-x" title="Close">×</button>
        <div class="_uidp-body">
          <div class="_uidp-img-col">
            <img src="${d.image || 'https://via.placeholder.com/400x300?text=No+Image'}"
                 alt="${d.title || ''}"
                 onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'">
          </div>
          <div class="_uidp-details-col">
            <div class="_uidp-hd">
              <h2 class="_uidp-title">${d.title || 'Item Details'}</h2>
              <span class="_uidp-badge ${statusKey}">${statusLabel}</span>
            </div>
            <div class="_uidp-desc">
              <h3>Description</h3>
              <p>${d.description || 'No description provided.'}</p>
            </div>
            <div class="_uidp-rows">
              <div class="_uidp-row"><span class="_uidp-lbl">Category:</span><span class="_uidp-val">${d.category || '—'}</span></div>
              <div class="_uidp-row"><span class="_uidp-lbl">Found Location:</span><span class="_uidp-val">${d.location || 'Unknown'}</span></div>
              <div class="_uidp-row"><span class="_uidp-lbl">Date Found:</span><span class="_uidp-val">${dateStr}</span></div>
              <div class="_uidp-row"><span class="_uidp-lbl">Storage Location:</span><span class="_uidp-val">${d.storageLocation || 'Not specified'}</span></div>
              <div class="_uidp-row"><span class="_uidp-lbl">Found By:</span><span class="_uidp-val">${d.foundBy || 'Unknown'}</span></div>
            </div>
            <div class="_uidp-actions">
              <button class="_uidp-close-btn">Close</button>
            </div>
          </div>
        </div>
      </div>`;

    overlay.querySelector('._uidp-x').addEventListener('click', _close);
    overlay.querySelector('._uidp-close-btn').addEventListener('click', _close);
  }).catch(_close);
}

// Insert (or refresh) the "Inquiring About" / "Reported Lost Item" card between the header and chat content
function _insertInquiryCard() {
  document.getElementById('chatInquiryCard')?.remove();

  const chatBtn      = document.getElementById('chat-with-staff-btn');
  const itemId       = chatBtn?.dataset.itemId        || null;
  const itemTitle    = chatBtn?.dataset.itemTitle     || '';
  const lostItemId   = chatBtn?.dataset.lostItemId    || null;
  const lostItemTitle = chatBtn?.dataset.lostItemTitle || '';

  // Found-item inquiry card
  if (itemId && itemTitle) {
    const card = document.createElement('div');
    card.id = 'chatInquiryCard';
    card.style.cssText = `
      display: flex; align-items: center; gap: 0.65rem;
      padding: 0.55rem 0.85rem; background: #fff7ed;
      border-bottom: 1px solid #fed7aa; flex-shrink: 0; cursor: pointer;
    `;
    card.title = 'Click to view item details';
    card.innerHTML = `
      <div id="chatInquiryThumb" style="
        width: 44px; height: 44px; border-radius: 6px; background: #ffedd5;
        flex-shrink: 0; overflow: hidden;
        display: flex; align-items: center; justify-content: center; font-size: 1.3rem;">?</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.6rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Inquiring About:</div>
        <div style="font-size:0.83rem;font-weight:600;color:#2a4599;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${itemTitle}</div>
        <div style="font-size:0.68rem;color:#f07316;">Click to view details →</div>
      </div>
    `;
    card.addEventListener('click', () => { _showItemDetailsPopup(itemId); });
    chatWidget.insertBefore(card, chatContent);
    if (window.firebase?.firestore) {
      firebase.firestore().collection('items').doc(itemId).get().then(doc => {
        if (!doc.exists) return;
        const imgUrl = doc.data().image;
        if (!imgUrl) return;
        const thumb = document.getElementById('chatInquiryThumb');
        if (thumb) {
          const img = document.createElement('img');
          img.src = imgUrl;
          img.style.cssText = 'width:44px;height:44px;object-fit:cover;';
          img.onerror = () => { thumb.textContent = '?'; };
          thumb.innerHTML = ''; thumb.appendChild(img);
        }
      }).catch(() => {});
    }
    return;
  }

  // Lost-item context card (admin-initiated thread about a user's reported lost item)
  if (lostItemId && lostItemTitle) {
    const card = document.createElement('div');
    card.id = 'chatInquiryCard';
    card.style.cssText = `
      display: flex; align-items: center; gap: 0.65rem;
      padding: 0.55rem 0.85rem; background: #fefce8;
      border-bottom: 1px solid #fde68a; flex-shrink: 0;
    `;
    card.innerHTML = `
      <div id="chatInquiryThumb" style="
        width: 44px; height: 44px; border-radius: 6px; background: #fef3c7;
        flex-shrink: 0; overflow: hidden;
        display: flex; align-items: center; justify-content: center; font-size: 1.3rem;">🔍</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.6rem;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Regarding Your Lost Item:</div>
        <div style="font-size:0.83rem;font-weight:600;color:#78350f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${lostItemTitle}</div>
        <div style="font-size:0.68rem;color:#b45309;">Staff is reaching out about this item</div>
      </div>
    `;
    chatWidget.insertBefore(card, chatContent);
    if (window.firebase?.firestore) {
      firebase.firestore().collection('lostItems').doc(lostItemId).get().then(doc => {
        if (!doc.exists) return;
        const imgUrl = doc.data().image;
        if (!imgUrl) return;
        const thumb = document.getElementById('chatInquiryThumb');
        if (thumb) {
          const img = document.createElement('img');
          img.src = imgUrl;
          img.style.cssText = 'width:44px;height:44px;object-fit:cover;';
          img.onerror = () => { thumb.textContent = '🔍'; };
          thumb.innerHTML = ''; thumb.appendChild(img);
        }
      }).catch(() => {});
    }
  }
}

// Initialize the chat interface after starting a chat
function initChatInterface() {
  console.log('Initializing chat interface');

  // Show item context card above the messages
  _insertInquiryCard();

  // Create messages container with specific height - leave room for input field
  chatContent.innerHTML = '<div id="messagesList" class="messages-list"></div>';
  messagesList = document.getElementById('messagesList');
  messagesList.style.cssText = `
    flex: 1 !important;
    overflow-y: auto !important;
    padding: 1rem !important;
    padding-bottom: 90px !important; /* Add padding at bottom to avoid messages being hidden by input */
    max-height: 350px !important;
    scroll-behavior: smooth !important;
  `;
  
  // Always remove any existing chat form container
  const existingForm = document.getElementById('chatFormContainer');
  if (existingForm) {
    existingForm.remove();
  }
  
  // Try both approaches to ensure the input field is visible
  
  // 1. Create input with our internal method
  const { chatFormContainer, chatForm, messageInput } = createChatInput();
  
  // 2. Also force create with the emergency fix if available
  setTimeout(() => {
    if (window.forceCreateChatInput) {
      console.log('Using emergency fix to create chat input');
      window.forceCreateChatInput();
    } else {
      console.log('Emergency fix not available, using standard approach');
      
      // Ensure our standard input is visible
      if (chatFormContainer) {
        chatFormContainer.style.cssText += `
          display: block !important; 
          visibility: visible !important; 
          opacity: 1 !important;
          position: fixed !important;
          bottom: 0 !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          width: 90% !important;
          z-index: 99999 !important;
        `;
      }
    }
    
    // Try to focus the input field again after a delay
    setTimeout(() => {
      const input = document.getElementById('messageInput');
      if (input) {
        input.focus();
        console.log('Focus set on message input after delay');
      }
    }, 500);
  }, 300);
  
  // Make sendMessage available globally for the emergency fix
  window.sendMessage = sendMessage;
  
  // Set up real-time listener for messages
  if (window.firebase?.firestore) {
    const db = firebase.firestore();
    
    // Clear previous listeners if they exist to prevent duplicates
    if (messagesUnsubscribe) {
      messagesUnsubscribe();
      messagesUnsubscribe = null;
    }
    if (statusUnsubscribe) {
      statusUnsubscribe();
      statusUnsubscribe = null;
    }
    
    messagesUnsubscribe = db.collection(CHAT_COLLECTION).doc(userChatId)
      .collection(CHAT_MESSAGES_COLLECTION)
      .orderBy('timestamp', 'asc')
      .onSnapshot((snapshot) => {
        handleMessagesUpdate(snapshot);
      }, (error) => {
        console.error('Error listening to messages:', error);
        addSystemMessage(`Error: ${error.message}`, true);
      });
      
    // Also listen for chat status changes (e.g., if admin ends it)
    statusUnsubscribe = db.collection(CHAT_COLLECTION).doc(userChatId)
      .onSnapshot((doc) => {
        const data = doc.data();
        if (data && data.active === false) {
          handleChatEnded(data.endedBy);
        }
      }, (error) => {
        console.error('Error listening to chat status:', error);
      });
  }
}

// Handle updates to messages
function handleMessagesUpdate(snapshot) {
  let newMessages = false;

  snapshot.docChanges().forEach(change => {
    if (change.type === 'added') {
      const message = change.doc.data();
      addMessageToUI(message);
      newMessages = true;

      // Badge the floating button only for general inquiry chats (no itemId)
      // Item-specific chat replies show in the inbox instead
      if (message.sender === 'admin' && chatWidget && chatWidget.style.display === 'none') {
        if (!currentChatItemId) {
          const badge = document.getElementById('fcbUnreadBadge');
          if (badge) badge.style.display = 'flex';
        }
      }
    }
  });

  if (newMessages) {
    scrollToBottom();
    resetIdleTimer();
  }
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

// Add a message to the UI
function addMessageToUI(message) {
  if (!messagesList) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${message.sender === 'user' ? 'user-message' : message.sender === 'admin' ? 'admin-message' : 'system-message'}`;
  
  const timestamp = formatTimestamp(message.timestamp);
  
  if (message.sender === 'system') {
    messageDiv.innerHTML = `<div class="message-content">${message.text}</div>`;
  } else {
    let contentHTML = '';
    if (message.imageUrl) {
      contentHTML += `<img src="${message.imageUrl}" alt="Shared image" style="max-width:100%; max-height:200px; border-radius:8px; margin-bottom:4px; cursor:zoom-in; display:block;" onclick="_showChatImageLightbox(this.src)">`;
    }
    if (message.text) {
      contentHTML += `<div class="message-content">${message.text}</div>`;
    }
    messageDiv.innerHTML = `
      ${contentHTML}
      <div class="message-time">${timestamp}</div>
    `;
  }
  
  messagesList.appendChild(messageDiv);
}

// Add a system message to the chat
function addSystemMessage(text, isError = false) {
  if (!messagesList) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message system-message ${isError ? 'error' : ''}`;
  messageDiv.innerHTML = `<div class="message-content">${text}</div>`;
  
  messagesList.appendChild(messageDiv);
  scrollToBottom();
}

// Send a chat message
function sendMessage(messageText, imageUrl) {
  if (!window.firebase?.firestore) {
    showError('Chat service is currently unavailable');
    return;
  }
  
  const db = firebase.firestore();
  const timestamp = firebase.firestore.FieldValue.serverTimestamp();
  
  // Build message data
  const messageData = {
    text: messageText || '',
    sender: 'user',
    timestamp: timestamp
  };
  
  if (imageUrl) {
    messageData.imageUrl = imageUrl;
    messageData.type = 'image';
  }
  
  // Add message to the chat
  db.collection(CHAT_COLLECTION).doc(userChatId)
    .collection(CHAT_MESSAGES_COLLECTION)
    .add(messageData)
    .then(() => {
      // Update the chat document with last message info
      return db.collection(CHAT_COLLECTION).doc(userChatId).update({
        lastMessage: imageUrl ? (messageText || '📷 Image') : messageText,
        lastTimestamp: timestamp,
        lastSender: 'user',
        unreadCount: firebase.firestore.FieldValue.increment(1),
        isNewSession: true  // make chat visible to admin only after first message
      });
    })
    .catch(error => {
      console.error('Error sending message:', error);
      showError('Failed to send message. Please try again.');
    });
}

// Resize image to keep data URL small enough for Firestore (max 800px)
function resizeImage(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 800;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Send image as a resized data URL directly (no Firebase Storage needed)
async function uploadAndSendImage(imageData, messageText) {
  try {
    addSystemMessage('Sending image...');
    
    // Resize image to keep it small
    const resizedUrl = await resizeImage(imageData.dataUrl);
    
    // Remove sending message
    const msgs = messagesList?.querySelectorAll('.system-message');
    if (msgs) {
      msgs.forEach(m => {
        if (m.textContent.includes('Sending image')) m.remove();
      });
    }
    
    // Send directly as data URL in Firestore message
    sendMessage(messageText, resizedUrl);
    console.log('Image sent successfully');
  } catch (error) {
    console.error('Error sending image:', error);
    // Last resort fallback
    sendMessage(messageText, imageData.dataUrl);
  }
}

// Chat ending removed — sessions persist until admin closes them
function endChat() {}

// Handle when a chat is ended (by user, admin, or timeout)
function handleChatEnded(endedBy) {
  // Clear idle timer
  clearTimeout(idleTimer);
  
  // Make sure the message list exists
  if (!messagesList) {
    console.error('messagesList not found in handleChatEnded');
    return;
  }
  
  // Add system message about chat ending
  let message = '';
  switch(endedBy) {
    case 'user':
      message = 'You have ended the chat.';
      break;
    case 'admin':
      message = 'The administrator has ended the chat.';
      break;
    case 'timeout':
      message = 'Chat automatically ended due to inactivity.';
      break;
    default:
      message = 'This chat session has ended.';
  }
  
  addSystemMessage(message);
  
  // Create end chat notification with restart button
  const restartDiv = document.createElement('div');
  restartDiv.className = 'chat-restart';
  restartDiv.style.cssText = `
    text-align: center;
    padding: 1rem;
    margin: 1rem 0;
    background-color: #f3f4f6;
    border-radius: 8px;
  `;
  
  restartDiv.innerHTML = `
    <p style="margin-bottom: 0.5rem;">Chat session ended. Would you like to start a new chat?</p>
    <button id="restartChat" style="background-color: #1a2e6b; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 500; cursor: pointer;">Start New Chat</button>
  `;
  
  // Add restart div to messages list
  messagesList.appendChild(restartDiv);
  
  // Force scroll to show restart button
  scrollToBottom();
  
  // Show chat input field but disable it
  const chatFormContainer = document.getElementById('chatFormContainer');
  const messageInput = document.getElementById('messageInput');
  
  if (chatFormContainer && messageInput) {
    // Keep the chat form visible but disable the input
    messageInput.disabled = true;
    messageInput.placeholder = 'Chat ended. Click "Start New Chat" to begin a new conversation.';
    messageInput.style.backgroundColor = '#f3f4f6';
    messageInput.style.color = '#9ca3af';
  } else {
    console.error('Chat input elements not found when ending chat');
  }
  
  // Add event listener to restart button - attach directly to the element we just created
  // This is more reliable than getElementById
  const restartBtn = restartDiv.querySelector('button');
  if (restartBtn) {
    console.log('Attaching listener to Restart Chat button');
    restartBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('Restart Chat button clicked');
      resetChat();
    });
  } else {
    console.error('Restart button not found in the new div');
  }
  
  // Reset chat ID
  userChatId = null;
}

// Reset chat to initial state — re-authenticates via Firebase and starts a new chat
function resetChat() {
  // Clear real-time listeners
  if (messagesUnsubscribe) {
    messagesUnsubscribe();
    messagesUnsubscribe = null;
  }
  if (statusUnsubscribe) {
    statusUnsubscribe();
    statusUnsubscribe = null;
  }

  // Clear current chat state
  document.getElementById('chatInquiryCard')?.remove();
  userChatId        = null;
  currentChatItemId = null;
  userInfo          = null;

  // Clear idle timer
  clearTimeout(idleTimer);

  // Reset the message input if it was disabled from a previous ended chat
  const msgInput = document.getElementById('messageInput');
  if (msgInput) {
    msgInput.disabled = false;
    msgInput.placeholder = 'Type your message here...';
    msgInput.style.backgroundColor = '';
    msgInput.style.color = '';
    msgInput.value = '';
  }

  // Hide chat form container while reconnecting
  const chatFormContainer = document.getElementById('chatFormContainer');
  if (chatFormContainer) {
    chatFormContainer.style.display = 'none';
  }

  // Show connecting state
  if (chatContent) {
    chatContent.innerHTML = '<div class="chat-loading">Connecting…</div>';
  }

  // Re-start with the currently logged-in Firebase Auth user
  if (!window.firebase || !firebase.auth) {
    if (chatWidget) chatWidget.style.display = 'none';
    window.location.href = 'login.html';
    return;
  }

  const unsubscribe = firebase.auth().onAuthStateChanged(function(authUser) {
    unsubscribe();
    if (authUser) {
      startChatForUser(authUser);
    } else {
      if (chatWidget) chatWidget.style.display = 'none';
      window.location.href = 'login.html';
    }
  });
}

// No-op: name/email form replaced by Firebase Auth
function setupUserDetailForm() {}

// Initialize EmailJS
function initEmailJS() {
  if (typeof emailjs !== 'undefined') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
    console.log('EmailJS initialized');
  } else {
    console.warn('EmailJS SDK not loaded');
  }
}

// Generate a 6-digit verification code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Request email verification - shows verification step
function requestEmailVerification(name, email, query) {
  if (!name || !email) {
    alert('Please provide both your name and email.');
    return;
  }
  
  // Replace the welcome screen with verification UI
  if (!chatContent) return;
  
  chatContent.innerHTML = `
    <div class="welcome-screen" style="padding: 1rem;">
      <h3 style="margin: 0 0 0.25rem 0; font-size: 1.1rem;">Verify Your Email</h3>
      <p style="color: #6b7280; font-size: 0.85rem; margin: 0 0 0.75rem 0;">We'll send a 6-digit code to <strong>${email}</strong></p>
      
      <div id="verifyMsg" style="display:none; padding:8px; border-radius:6px; margin-bottom:8px; font-size:0.85rem;"></div>
      
      <button id="sendCodeBtn" type="button" style="
        display: block; width: 100%; padding: 10px; margin-bottom: 10px;
        background: #1a2e6b; color: white; border: none; border-radius: 6px;
        font-weight: bold; cursor: pointer; font-size: 0.95rem;">Send Verification Code</button>
      
      <div id="codeInputSection" style="display:none;">
        <label style="display:block; font-weight:600; margin-bottom:4px; font-size:0.9rem;">Enter 6-digit Code</label>
        <input type="text" id="verifyCodeInput" maxlength="6" placeholder="000000" style="
          display: block; width: 100%; padding: 10px; margin-bottom: 10px;
          border: 2px solid #1a2e6b; border-radius: 6px; font-size: 1.2rem;
          text-align: center; letter-spacing: 8px; font-weight: bold;
          box-sizing: border-box; background: white; color: black;">
        <button id="verifyCodeBtn" type="button" style="
          display: block; width: 100%; padding: 10px;
          background: #16a34a; color: white; border: none; border-radius: 6px;
          font-weight: bold; cursor: pointer; font-size: 0.95rem;">Verify & Start Chat</button>
      </div>
      
      <button id="backToFormBtn" type="button" style="
        display: block; width: 100%; padding: 8px; margin-top: 8px;
        background: none; color: #6b7280; border: 1px solid #d1d5db; border-radius: 6px;
        cursor: pointer; font-size: 0.85rem;">← Back</button>
    </div>
  `;
  
  // Send Code button
  document.getElementById('sendCodeBtn').addEventListener('click', () => {
    sendVerificationCode(name, email);
  });
  
  // Verify Code button
  document.getElementById('verifyCodeBtn').addEventListener('click', () => {
    const inputCode = document.getElementById('verifyCodeInput').value.trim();
    if (verifyCode(inputCode)) {
      // Verification successful - start chat
      startChat(name, email, query);
    }
  });
  
  // Allow Enter key on code input
  document.getElementById('verifyCodeInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('verifyCodeBtn')?.click();
    }
  });
  
  // Back button
  document.getElementById('backToFormBtn').addEventListener('click', () => {
    // Reset verification state
    verificationCode = null;
    verificationExpiry = null;
    // Rebuild the welcome form
    chatContent.innerHTML = getChatWelcomeHTML();
    setupUserDetailForm();
    // Prefill the fields
    const nameEl = document.getElementById('userName');
    const emailEl = document.getElementById('userEmail');
    if (nameEl) nameEl.value = name;
    if (emailEl) emailEl.value = email;
  });
}

// Send verification code via EmailJS
function sendVerificationCode(name, email) {
  const msgEl = document.getElementById('verifyMsg');
  const sendBtn = document.getElementById('sendCodeBtn');
  const codeSection = document.getElementById('codeInputSection');
  
  // Check if EmailJS is configured
  if (EMAILJS_PUBLIC_KEY === 'YOUR_EMAILJS_PUBLIC_KEY' || 
      EMAILJS_SERVICE_ID === 'YOUR_EMAILJS_SERVICE_ID' || 
      EMAILJS_TEMPLATE_ID === 'YOUR_EMAILJS_TEMPLATE_ID') {
    showVerifyMsg('System Error: Email service not configured properly.', 'error');
    return;
  }
  
  // Rate limit check
  const now = Date.now();
  if (now - lastCodeSentAt < CODE_COOLDOWN_MS) {
    const waitSec = Math.ceil((CODE_COOLDOWN_MS - (now - lastCodeSentAt)) / 1000);
    showVerifyMsg(`Please wait ${waitSec}s before requesting a new code.`, 'warning');
    return;
  }
  
  // Generate code
  verificationCode = generateCode();
  verificationExpiry = Date.now() + CODE_EXPIRY_MS;
  
  // Disable button and show loading
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  sendBtn.style.opacity = '0.6';
  
  // Initialize EmailJS if not done
  if (typeof emailjs !== 'undefined') {
    try {
      emailjs.init({
        publicKey: EMAILJS_PUBLIC_KEY,
      });
    } catch (e) {
      console.warn('EmailJS init warning:', e);
    }
  }
  
  if (typeof emailjs === 'undefined') {
    showVerifyMsg('Email service not available. Please try again later.', 'error');
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send Verification Code';
    sendBtn.style.opacity = '1';
    return;
  }
  
  // Send email via EmailJS
  // We send multiple variants of the email variable to ensure it matches whatever is configured in the EmailJS template
  const templateParams = {
    to_email: email,
    email: email,        // Common fallback
    recipient: email,    // Common fallback
    reply_to: email,     // Common fallback
    to: email,           // Another fallback
    target_email: email, // Another fallback
    to_name: name,
    verification_code: verificationCode,
    from_name: 'Lost & Found - Baguio City'
  };
  
  console.log('Sending EmailJS payload:', templateParams);
  
  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams, {
    publicKey: EMAILJS_PUBLIC_KEY,
  })
  .then(() => {
    lastCodeSentAt = Date.now();
    showVerifyMsg('Verification code sent! Check your email.', 'success');
    // Show code input
    if (codeSection) codeSection.style.display = 'block';
    // Update button to resend
    sendBtn.textContent = 'Resend Code';
    sendBtn.disabled = false;
    sendBtn.style.opacity = '1';
    // Focus the code input
    document.getElementById('verifyCodeInput')?.focus();
  })
  .catch((error) => {
    console.error('EmailJS FAILED:', error);
    if (error.text) console.error('Error Details:', error.text);
    
    let errorMsg = 'Failed to send code. ';
    
    // Check for common issues
    if (window.location.protocol === 'file:') {
      errorMsg += 'WARNING: EmailJS often fails when running from "file://" protocol. Please use a local server (localhost) or deploy the site. ';
      console.warn('EmailJS Protocol Warning: APIs often block file:// origin. Use a local server.');
    }
    
    if (error.text && error.text.includes('recipients address is empty')) {
      errorMsg = 'Configuration Error: "To Email" field is missing in your EmailJS Template. Please go to EmailJS -> Email Templates -> Settings, and set "To Email" to {{to_email}}. ';
    } else if (error.status === 0 || error.text === 'Network Error') {
      errorMsg += 'Network error. Please check your internet connection or disable Ad Blockers (they often block EmailJS).';
    } else if (error.status === 400) {
      errorMsg += 'Invalid configuration. Please check your EmailJS Public Key and IDs.';
    } else if (error.status === 412) {
      errorMsg += 'Template error. The variables in your code do not match your EmailJS template.';
    } else {
      errorMsg += error.text || 'Unknown error. Check console (F12) for details.';
    }
    
    showVerifyMsg(errorMsg, 'error');
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send Verification Code';
    sendBtn.style.opacity = '1';

    // Add Test Mode fallback link
    const msgEl = document.getElementById('verifyMsg');
    if (msgEl) {
        const testLink = document.createElement('div');
        testLink.style.marginTop = '8px';
        testLink.style.fontSize = '0.8rem';
        testLink.innerHTML = `<a href="#" id="testModeLink" style="color: #6b7280; text-decoration: underline;">Test Mode: Click here to see code (Bypass Email)</a>`;
        msgEl.appendChild(testLink);
        
        document.getElementById('testModeLink').addEventListener('click', (e) => {
            e.preventDefault();
            alert(`TEST MODE CODE: ${verificationCode}`);
            console.log(`TEST MODE CODE: ${verificationCode}`);
            if (codeSection) codeSection.style.display = 'block';
            document.getElementById('verifyCodeInput').value = verificationCode;
        });
    }
  });
}

// Verify the entered code
function verifyCode(inputCode) {
  if (!inputCode || inputCode.length !== 6) {
    showVerifyMsg('Please enter the 6-digit code.', 'warning');
    return false;
  }
  
  if (!verificationCode || !verificationExpiry) {
    showVerifyMsg('No code has been sent. Please request a new code.', 'error');
    return false;
  }
  
  if (Date.now() > verificationExpiry) {
    showVerifyMsg('Code has expired. Please request a new code.', 'error');
    verificationCode = null;
    return false;
  }
  
  if (inputCode !== verificationCode) {
    showVerifyMsg('Incorrect code. Please try again.', 'error');
    return false;
  }
  
  // Code is valid - reset state
  verificationCode = null;
  verificationExpiry = null;
  return true;
}

// Show message in the verification UI
function showVerifyMsg(text, type) {
  const el = document.getElementById('verifyMsg');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = text;
  if (type === 'success') {
    el.style.background = '#dcfce7';
    el.style.color = '#166534';
  } else if (type === 'error') {
    el.style.background = '#fef2f2';
    el.style.color = '#991b1b';
  } else {
    el.style.background = '#fef9c3';
    el.style.color = '#854d0e';
  }
}

// No-op: name/email welcome form replaced by Firebase Auth
function getChatWelcomeHTML() {
  return '<div class="chat-loading">Connecting…</div>';
}

// Reset the idle timer
function resetIdleTimer() {
  if (!userChatId) return;
  
  // Clear existing timer
  clearTimeout(idleTimer);
  
  // Set new timer
  idleTimer = setTimeout(() => {
    handleIdleTimeout();
  }, IDLE_TIMEOUT);
}

// Idle auto-end removed — chats stay open
function handleIdleTimeout() {}
function endChatDueToIdle() {}

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
    
    // Format the time
    return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
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
  
  if (messagesList) {
    messagesList.appendChild(errorDiv);
  } else {
    chatContent.appendChild(errorDiv);
  }
  
  // Remove after 5 seconds
  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}

// Scroll chat window to bottom
function scrollToBottom() {
  if (messagesList) {
    // Force scroll to absolute bottom with a slight delay to ensure rendering is complete
    setTimeout(() => {
      messagesList.scrollTop = messagesList.scrollHeight + 1000;
      console.log('Scrolled to bottom, height:', messagesList.scrollHeight);
    }, 50);
  }
}

// Add chat styles to the document
function addChatStyles() {
  if (document.getElementById('user-chat-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'user-chat-styles';
  style.textContent = `
    .chat-button {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      background-color: #1a2e6b;
      border-radius: 50%;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 9998;
      transition: transform 0.2s, background-color 0.2s;
    }
    
    .chat-button:hover {
      transform: scale(1.05);
      background-color: #1a2e6b;
    }
    
    .chat-button.active {
      background-color: #2a4599;
    }
    
    .chat-icon {
      font-size: 24px;
      line-height: 1;
    }
    
    .chat-widget {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 700px;
      height: 560px;
      background-color: white;
      border-radius: 12px;
      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      z-index: 9999;
      overflow: hidden;
    }
    
    .chat-header {
      background-color: #1a2e6b;
      color: white;
      padding: 0.75rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .chat-title-wrap {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .chat-title {
      font-weight: 600;
      font-size: 1rem;
      line-height: 1.2;
    }

    .admin-presence {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .presence-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }

    .presence-dot.online {
      background-color: #4ade80;
      box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.3);
    }

    .presence-dot.offline {
      background-color: #9ca3af;
    }

    .presence-label {
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.85);
      font-weight: 400;
    }

    .chat-controls {
      display: flex;
      gap: 0.5rem;
    }
    
    .chat-control-btn {
      background: none;
      border: none;
      color: white;
      font-size: 1.25rem;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }
    
    .chat-control-btn:hover {
      background-color: rgba(255, 255, 255, 0.2);
    }
    
    .chat-content {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      background-color: #f9fafb;
    }
    
    .welcome-screen {
      padding: 1rem;
    }
    
    .welcome-screen h3 {
      margin-top: 0;
      margin-bottom: 0.5rem;
      color: #1f2937;
      font-size: 1.25rem;
    }
    
    .welcome-screen p {
      margin-bottom: 1rem;
      color: #6b7280;
    }
    
    .user-detail-form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    
    .form-group label {
      font-size: 0.875rem;
      font-weight: 500;
      color: #374151;
    }
    
    .form-group input,
    .form-group textarea {
      padding: 0.75rem;
      border: 2px solid #d1d5db;
      border-radius: 6px;
      font-family: inherit;
      font-size: 1rem;
      width: 100%;
      background-color: #ffffff;
      color: #333333;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      outline: none;
    }
    
    .form-group input:focus,
    .form-group textarea:focus {
      border-color: #1a2e6b;
      box-shadow: 0 0 0 3px rgba(26, 46, 107, 0.2);
    }
    
    .start-chat-btn {
      background-color: #1a2e6b;
      color: white;
      border: none;
      padding: 0.625rem 1rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      margin-top: 0.5rem;
    }
    
    .start-chat-btn:hover {
      background-color: #1a2e6b;
    }
    
    .chat-form-container {
      padding: 0.75rem;
      border-top: 1px solid #e5e7eb;
      background-color: white;
    }
    
    .chat-form {
      display: flex;
      gap: 0.5rem;
    }
    
    .chat-form textarea {
      flex: 1;
      resize: none;
      padding: 0.625rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-family: inherit;
      font-size: 0.875rem;
    }
    
    .chat-send-button {
      align-self: flex-end;
      background-color: #1a2e6b;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
    }
    
    .chat-send-button:hover {
      background-color: #1a2e6b;
    }
    
    .messages-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    
    .chat-message {
      max-width: 80%;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      position: relative;
      word-wrap: break-word;
    }
    
    .user-message {
      align-self: flex-end;
      background-color: #ffedd5;
      border-bottom-right-radius: 0;
    }
    
    .admin-message {
      align-self: flex-start;
      background-color: #f3f4f6;
      border-bottom-left-radius: 0;
    }
    
    .system-message {
      align-self: center;
      background-color: #f3f4f6;
      color: #6b7280;
      font-style: italic;
      font-size: 0.875rem;
      padding: 0.5rem 1rem;
      border-radius: 16px;
      max-width: 90%;
      text-align: center;
    }
    
    .system-message.error {
      background-color: #fee2e2;
      color: #b91c1c;
    }
    
    .message-time {
      font-size: 0.7rem;
      color: #6b7280;
      text-align: right;
      margin-top: 0.25rem;
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
    
    .chat-restart {
      text-align: center;
      padding: 1rem;
      margin-top: 1rem;
      background-color: #f3f4f6;
      border-radius: 8px;
    }
    
    .restart-chat-btn {
      background-color: #1a2e6b;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      margin-top: 0.5rem;
    }
    
    .restart-chat-btn:hover {
      background-color: #1a2e6b;
    }
    
    @media (max-width: 480px) {
      .chat-widget {
        width: calc(100% - 40px);
        height: calc(100% - 160px);
        right: 20px;
        bottom: 90px;
      }
    }
  `;
  
  document.head.appendChild(style);
}
