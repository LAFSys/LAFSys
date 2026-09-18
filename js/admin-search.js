/**
 * Admin Search Functionality
 * This script adds search capabilities to the admin dashboard item section
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin search functionality loaded');
    setupItemSearch();
    
    // Initialize Lucide icons to ensure search icon loads properly
    if (window.lucide?.createIcons) {
        setTimeout(() => {
            lucide.createIcons();
            console.log('Search icons reinitialized');
        }, 100);
    }
    
    // Also initialize when switching to items section
    document.querySelectorAll('.nav-link[data-section="items"]').forEach(link => {
        link.addEventListener('click', function() {
            setTimeout(() => {
                if (window.lucide?.createIcons) lucide.createIcons();
            }, 100);
        });
    });
});

/**
 * Set up item search functionality
 */
function setupItemSearch() {
    const searchInput = document.getElementById('itemSearchInput');
    const searchButton = document.getElementById('itemSearchButton');
    
    if (!searchInput || !searchButton) {
        console.error('Search elements not found');
        return;
    }
    
    // Add event listener for search button click
    searchButton.addEventListener('click', function() {
        performSearch();
    });
    
    // Add event listener for enter key in search input
    searchInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            performSearch();
        }
    });
    
    // Live search — filter on every keystroke
    searchInput.addEventListener('input', function() {
        performSearch();
    });
}

/**
 * Perform search on items
 */
function performSearch() {
    const searchInput = document.getElementById('itemSearchInput');
    if (!searchInput) return;

    // The items list is paginated, so hiding rows in the DOM would only ever
    // search the page on screen — admin.js re-renders from the full dataset.
    window._setItemsSearchQuery?.(searchInput.value.trim());
}

/**
 * Reset display to show all items
 */
function resetItemsDisplay() {
    const searchInput = document.getElementById('itemSearchInput');
    if (searchInput) searchInput.value = '';
    window._setItemsSearchQuery?.('');
}

/**
 * Highlight matching text in search results
 */
function highlightMatches(row, query) {
    // Remove any existing highlights first
    removeHighlights(row);
    
    // Fields to highlight
    const textElements = [
        row.querySelector('.item-name'),
        row.querySelector('.item-category'),
        row.querySelector('div:nth-child(2)')
    ];
    
    // Loop through each element and highlight matches
    textElements.forEach(element => {
        if (!element) return;
        
        const originalText = element.textContent;
        const lowerText = originalText.toLowerCase();
        const queryRegex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
        
        if (lowerText.includes(query.toLowerCase())) {
            element.innerHTML = originalText.replace(
                queryRegex, 
                '<span class="highlight-match" style="background-color: #fef08a; font-weight: bold;">$1</span>'
            );
        }
    });
}

/**
 * Remove highlights from search results
 */
function removeHighlights(row) {
    const highlightedElements = row.querySelectorAll('.highlight-match');
    highlightedElements.forEach(element => {
        const parent = element.parentNode;
        if (parent) {
            parent.textContent = parent.textContent; // This removes all HTML and keeps just text
        }
    });
}

/**
 * Escape special characters for safe regex usage
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
