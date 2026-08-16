/**
 * Admin Dashboard Item Modal
 * This script adds a modal popup that matches the User Dashboard style
 * for viewing item details in the Admin Dashboard
 */

// Initialize when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('Admin modal script loaded');
  setupItemClickHandlers();
});

// Setup click handlers for items in both Dashboard and Items sections
function setupItemClickHandlers() {
  // Process both Dashboard and Items sections
  const sections = [
    document.getElementById('section-dashboard'),
    document.getElementById('section-items')
  ];
  
  // Apply handlers to each section
  sections.forEach(section => {
    if (!section) return; // Skip if section not found
    
    const itemRows = section.querySelectorAll('.table-row');
    itemRows.forEach(row => {
      // Skip rows that already have click handlers
      if (row.dataset.hasModalHandler) return;
      
      row.addEventListener('click', function(e) {
        // Ignore clicks on buttons, selects, or action cells
        if (!e.target.closest('button') && 
            !e.target.closest('select') && 
            !e.target.closest('.action-cell') && 
            !e.target.closest('.status-cell')) {
          const itemId = this.dataset.id;
          if (itemId) {
            showItemDetailsModal(itemId);
            e.preventDefault(); // Prevent default navigation
            e.stopPropagation(); // Stop event bubbling
            return false;
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
      
      // Change cursor to pointer to indicate it's clickable
      row.style.cursor = 'pointer';
      
      // Mark as processed
      row.dataset.hasModalHandler = 'true';
    });
  });
  
  // Set up event listener for dynamically added items
  document.addEventListener('itemsUpdated', function() {
    setTimeout(setupItemClickHandlers, 300);
  });
}

// Function to show the item details modal
async function showItemDetailsModal(itemId) {
  console.log('Showing item details for:', itemId);
  
  try {
    // Fetch item details
    const item = await fetchItemDetails(itemId);
    if (!item) {
      console.error('Item not found:', itemId);
      return;
    }
    
    // Create modal
    const modal = createItemDetailsModal(item);
    
    // Show modal
    document.body.appendChild(modal);
    
    // Setup close handler
    setupModalCloseHandlers(modal);
    
  } catch (error) {
    console.error('Error showing item details:', error);
  }
}

// Create a modal exactly matching the User Dashboard style
function createItemDetailsModal(item) {
  // Create modal container
  const modal = document.createElement('div');
  modal.className = 'admin-item-modal';
  
  // Format date string if available
  let dateStr = 'Unknown';
  if (item.date) {
    if (typeof item.date.toDate === 'function') {
      dateStr = item.date.toDate().toLocaleDateString();
    } else if (typeof item.date === 'string') {
      dateStr = new Date(item.date).toLocaleDateString();
    }
  }
  
  // Get status display
  const statusClass = item.status === 'claimed'   ? 'status-completed' :
                      item.status === 'soon'      ? 'status-pending'   :
                      item.status === 'archived'  ? 'status-archived'  : 'status-active';
  const statusText  = item.status === 'claimed'   ? 'Claimed'      :
                      item.status === 'soon'      ? 'For Disposal' :
                      item.status === 'archived'  ? 'Archived'     : 'Active';
  
  // Modal HTML structure - matching User Dashboard exactly
  modal.innerHTML = `
    <div class="item-modal-overlay"></div>
    <div class="item-modal-content">
      <div class="item-modal-close">×</div>
      
      <div class="item-modal-body">
        <div class="item-modal-image-col">
          <img src="${item.image || 'https://via.placeholder.com/400x300?text=No+Image'}" alt="${item.title || 'Item Image'}"
               style="cursor:zoom-in;"
               onclick="var lb=document.getElementById('adminImgLightbox');if(lb){document.getElementById('adminImgLightboxImg').src=this.src;lb.style.display='flex';}">
        </div>
        
        <div class="item-modal-details-col">
          <div class="item-modal-header">
            <h2>${item.title || 'Item Details'}</h2>
            <span class="item-status-badge ${statusClass}">${statusText}</span>
          </div>
          
          <div class="item-detail-section">
            <h3>Description</h3>
            <p>${item.description || 'No description provided.'}</p>
          </div>
          
          <div class="item-detail-rows">
            <div class="item-detail-row">
              <span class="item-detail-label">Category:</span>
              <span class="item-detail-value">${item.category || 'other'}</span>
            </div>
            
            <div class="item-detail-row">
              <span class="item-detail-label">Found Location:</span>
              <span class="item-detail-value">${item.location || 'Unknown'}</span>
            </div>
            
            <div class="item-detail-row">
              <span class="item-detail-label">Date Found:</span>
              <span class="item-detail-value">${dateStr}</span>
            </div>
            
            <div class="item-detail-row">
              <span class="item-detail-label">Storage Location:</span>
              <span class="item-detail-value">${item.storageLocation || 'Not specified'}</span>
            </div>
            
            <div class="item-detail-row">
              <span class="item-detail-label">Found By:</span>
              <span class="item-detail-value">${item.foundBy || 'Unknown'}</span>
            </div>
            ${item.status === 'archived' ? `
            <div class="item-detail-row">
              <span class="item-detail-label" style="color:#6b7280;">Archived by:</span>
              <span class="item-detail-value" style="color:#6b7280;">Admin (${item.archivedByAdminName || 'Administrator'})</span>
            </div>` : ''}
          </div>

        </div>
      </div>
    </div>
  `;
  
  // Add styles
  addItemModalStyles();
  
  return modal;
}

// Fetch item details from Firebase
async function fetchItemDetails(itemId) {
  if (!window.firebase?.firestore) {
    console.error('Firebase not available');
    return null;
  }
  
  try {
    const db = firebase.firestore();
    const docRef = await db.collection('items').doc(itemId).get();
    
    if (docRef.exists) {
      const data = docRef.data();
      return {
        id: itemId,
        ...data
      };
    } else {
      console.error('Item document does not exist:', itemId);
      return null;
    }
  } catch (error) {
    console.error('Error fetching item details:', error);
    return null;
  }
}

// Setup handlers to close the modal
function setupModalCloseHandlers(modal) {
  // Close when clicking X button
  const closeBtn = modal.querySelector('.item-modal-close');
  closeBtn.addEventListener('click', () => closeModal(modal));
  
  // Close when clicking close button (if present)
  const closeBtnBottom = modal.querySelector('.item-modal-close-btn');
  if (closeBtnBottom) closeBtnBottom.addEventListener('click', () => closeModal(modal));
  
  // Close when clicking overlay
  const overlay = modal.querySelector('.item-modal-overlay');
  overlay.addEventListener('click', () => closeModal(modal));
  
  // Close when pressing Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal.parentElement) {
      closeModal(modal);
    }
  });
}

// Close the modal
function closeModal(modal) {
  if (modal.parentElement) {
    modal.parentElement.removeChild(modal);
  }
}

// Add CSS styles for the modal - matching User Dashboard exactly
function addItemModalStyles() {
  const styleId = 'admin-item-modal-styles';
  if (document.getElementById(styleId)) {
    return; // Styles already added
  }
  
  const styleElement = document.createElement('style');
  styleElement.id = styleId;
  styleElement.textContent = `
    /* Hover effect for dashboard item rows */
    .table-row-hover {
      background-color: #dbeafe !important;
      transition: background-color 0.2s ease;
      box-shadow: 0 0 5px rgba(59, 130, 246, 0.5);
    }

    .admin-item-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    }
    
    .item-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 1;
    }
    
    .item-modal-content {
      position: relative;
      z-index: 2;
      background-color: white;
      width: 80%;
      max-width: 1100px;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .item-modal-close {
      position: absolute;
      top: 15px;
      right: 15px;
      width: 30px;
      height: 30px;
      background-color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      z-index: 3;
    }
    
    .item-modal-body {
      display: flex;
      min-height: 400px;
    }
    
    .item-modal-image-col {
      width: 40%;
      background-color: #f8fafc;
      padding: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .item-modal-image-col img {
      max-width: 100%;
      max-height: 440px;
      object-fit: contain;
    }

    .item-modal-details-col {
      width: 60%;
      padding: 2rem 2.5rem 2rem 2rem;
      overflow-y: auto;
    }

    .item-modal-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }

    .item-modal-header h2 {
      font-size: 1.4rem;
      font-weight: 700;
      margin: 0;
      color: #0f172a;
    }

    .item-status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .item-status-badge.status-active {
      background-color: #dcfce7;
      color: #166534;
    }

    .item-status-badge.status-pending {
      background-color: #fef3c7;
      color: #92400e;
    }

    .item-status-badge.status-completed {
      background-color: #ffedd5;
      color: #2a4599;
    }

    .item-status-badge.status-archived {
      background-color: #e5e7eb;
      color: #374151;
    }

    .item-detail-section {
      margin-bottom: 1.25rem;
    }

    .item-detail-section h3 {
      font-size: 0.95rem;
      font-weight: 600;
      color: #374151;
      margin: 0 0 0.25rem 0;
    }

    .item-detail-section p {
      margin: 0;
      line-height: 1.5;
      color: #6b7280;
    }

    .item-detail-rows {
      margin-bottom: 1.5rem;
    }

    .item-detail-row {
      display: flex;
      align-items: baseline;
      padding: 0.4rem 0;
    }

    .item-detail-label {
      font-weight: 600;
      color: #374151;
      min-width: 140px;
      font-size: 0.9rem;
    }

    .item-detail-value {
      color: #64748b;
      font-size: 0.9rem;
    }

    @media (max-width: 768px) {
      .item-modal-content {
        width: 92%;
        max-height: 88vh;
        overflow-y: auto;
        border-radius: 12px;
      }
      .item-modal-body {
        flex-direction: column;
        min-height: 0;
      }
      .item-modal-image-col {
        width: 100%;
        padding: 0.75rem 1.25rem;
        min-height: 0;
        max-height: 180px;
      }
      .item-modal-image-col img {
        max-height: 150px;
        object-fit: contain;
        width: 100%;
      }
      .item-modal-details-col {
        width: 100%;
        padding: 1.5rem 1.25rem 1.25rem;
      }
      .item-modal-header {
        margin-bottom: 0.85rem;
      }
      .item-modal-header h2 {
        font-size: 1.2rem;
      }
      .item-detail-label {
        min-width: 120px;
        font-size: 0.85rem;
      }
      .item-detail-value {
        font-size: 0.85rem;
      }
    }
  `;
  
  document.head.appendChild(styleElement);
}
