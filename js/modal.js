// Modal and Tab functionality
class Modal {
    constructor(modalId) {
        this.modal = document.getElementById(modalId);
        this.closeBtn = this.modal.querySelector('.close');
        this.setupEventListeners();
    }

    open() {
        document.body.style.overflow = 'hidden';
        this.modal.classList.add('active');
        // Focus on the first focusable element
        const focusable = this.modal.querySelector('button, [href], input, select, textarea');
        if (focusable) focusable.focus();
    }

    close() {
        document.body.style.overflow = '';
        this.modal.classList.remove('active');
        
        // If closing item details modal and we came from image search, re-open it
        if (this.modal.id === 'itemDetailsModal' && window._returnToImageSearch) {
            window._returnToImageSearch = false;
            setTimeout(() => {
                if (window.imageSearchModal) {
                    window.imageSearchModal.open();
                }
            }, 100);
        }
    }

    setupEventListeners() {
        // Close modal when clicking the close button
        this.closeBtn.addEventListener('click', () => this.close());

        // Close modal when clicking outside the modal content
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                this.close();
            }
        });
    }
}

// Tab functionality
class Tabs {
    constructor(containerId) {
        this.container = document.querySelector(containerId);
        if (!this.container) return;
        
        this.tabButtons = this.container.querySelectorAll('.tab-button');
        this.tabPanes = this.container.querySelectorAll('.tab-pane');
        this.setupTabs();
    }

    setupTabs() {
        this.tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = button.getAttribute('data-tab');
                this.switchTab(tabId);
            });
        });
    }

    switchTab(tabId) {
        // Hide all tab panes
        this.tabPanes.forEach(pane => {
            pane.classList.remove('active');
        });

        // Deactivate all tab buttons
        this.tabButtons.forEach(button => {
            button.classList.remove('active');
        });

        // Show the selected tab pane
        const activePane = this.container.querySelector(`#${tabId}-tab`);
        if (activePane) {
            activePane.classList.add('active');
        }

        // Activate the clicked tab button
        const activeButton = this.container.querySelector(`[data-tab="${tabId}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }
}

// Chat functionality
class Chat {
    constructor(containerId) {
        this.container = document.querySelector(containerId);
        if (!this.container) return;
        
        this.messagesContainer = this.container.querySelector('.chat-messages');
        this.messageInput = this.container.querySelector('.chat-input input');
        this.sendButton = this.container.querySelector('.chat-input button');
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
    }

    sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;

        // Add user message
        this.addMessage(message, 'user');
        this.messageInput.value = '';

        // Simulate staff response after a short delay
        setTimeout(() => {
            this.addMessage('Thank you for your message. Our staff will get back to you shortly.', 'staff');
        }, 1000);
    }

    addMessage(text, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender);
        messageElement.textContent = text;
        this.messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
}

// Initialize modals when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize modals
    const itemDetailsModal = new Modal('itemDetailsModal');
    const claimModal = new Modal('claimModal');
    const imageSearchModal = new Modal('imageSearchModal');

    // Initialize tabs in the item details modal
    const tabs = new Tabs('.modal-content');
    // Expose a helper to switch tabs in item details
    window.switchItemDetailsTab = function(tabId){
        if (tabs && typeof tabs.switchTab === 'function') {
            tabs.switchTab(tabId);
        }
    };

    // Initialize chat in the chat tab
    const chat = new Chat('#chat-tab');

    // Make modals globally available
    window.itemDetailsModal = itemDetailsModal;
    window.claimModal = claimModal;
    window.imageSearchModal = imageSearchModal;
});

// Function to open item details modal with item data
function openItemDetails(item) {
    if (!item) return;

    // Store for chat widget
    window._currentItemForChat = { id: item.id, title: item.title };

    // Build image list (primary + additional)
    const allImages = [];
    if (item.image && !item.image.includes('placeholder.com')) allImages.push(item.image);
    if (Array.isArray(item.additionalImages)) {
        for (const src of item.additionalImages) if (src) allImages.push(src);
    }
    if (allImages.length === 0) allImages.push('https://via.placeholder.com/400x300?text=No+Image');

    const mainImg  = document.getElementById('modalItemImage');
    const thumbsEl = document.getElementById('galleryThumbs');
    const prevBtn  = document.getElementById('galleryPrev');
    const nextBtn  = document.getElementById('galleryNext');

    // Fallback: old HTML without gallery structure
    if (!thumbsEl || !prevBtn || !nextBtn) {
        if (mainImg) mainImg.src = allImages[0];
        // Skip gallery setup gracefully
    } else {
        let currentIdx = 0;

        function showSlide(idx) {
            currentIdx = (idx + allImages.length) % allImages.length;
            mainImg.src = allImages[currentIdx];
            thumbsEl.querySelectorAll('.gallery-thumb').forEach((t, i) =>
                t.classList.toggle('active', i === currentIdx)
            );
        }

        // Build thumbnail strip (only shown when 2+ images)
        thumbsEl.innerHTML = '';
        if (allImages.length > 1) {
            allImages.forEach((src, i) => {
                const t = document.createElement('div');
                t.className = 'gallery-thumb' + (i === 0 ? ' active' : '');
                const img = document.createElement('img');
                img.src = src;
                img.alt = 'Photo ' + (i + 1);
                t.appendChild(img);
                t.addEventListener('click', () => showSlide(i));
                thumbsEl.appendChild(t);
            });
            prevBtn.classList.remove('hidden');
            nextBtn.classList.remove('hidden');
        } else {
            prevBtn.classList.add('hidden');
            nextBtn.classList.add('hidden');
        }

        prevBtn.onclick = () => showSlide(currentIdx - 1);
        nextBtn.onclick = () => showSlide(currentIdx + 1);

        showSlide(0);

        // Remove any leftover zoom overlay from a previous approach
        var old = document.getElementById('_galleryZoom');
        if (old) old.remove();

        // Direct click-to-lightbox on the main image
        mainImg.style.cursor = 'zoom-in';
        mainImg.onclick = function() {
            var src = this.src;
            if (src && src.indexOf('http') !== -1 && typeof window._openUserLightbox === 'function') {
                window._openUserLightbox(src);
            }
        };
    }

    // Fill text fields
    document.getElementById('modalItemTitle').textContent = item.title || 'Untitled Item';
    document.getElementById('modalItemDescription').textContent = item.description || 'No description available.';
    document.getElementById('modalItemCategory').textContent = item.category || 'Not specified';
    document.getElementById('modalItemLocation').textContent = item.location || 'Not specified';
    document.getElementById('modalItemStorageLocation').textContent = item.storageLocation || 'Not specified';
    document.getElementById('modalItemFoundBy').textContent = item.foundBy || 'Unknown';

    try {
        document.getElementById('modalItemDate').textContent = item.date
            ? new Date(item.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : 'Not specified';
    } catch (_) {
        document.getElementById('modalItemDate').textContent = item.date || 'Not specified';
    }

    const statusBadge = document.getElementById('modalItemStatus');
    const s = (item.status || 'active').toLowerCase();
    statusBadge.className = 'idm-status-badge ' + (
        s === 'claimed'  ? 'idm-status-claimed'  :
        s === 'returned' ? 'idm-status-returned' :
                           'idm-status-active'
    );
    statusBadge.textContent = s.charAt(0).toUpperCase() + s.slice(1);

    const itemModal = document.getElementById('itemDetailsModal');
    itemModal.style.display = '';
    itemModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}
