/**
 * Item Initialization Script
 * 
 * This script initializes Firebase for item data and adds
 * Firebase app configuration to the page.
 */

// Initialize Firebase with proper configuration if not already done
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    const firebaseConfig = {
        apiKey: "AIzaSyBGH1-fruNM0GPOLpOjfOIxHpLgqzt8fe0",
        authDomain: "lafsys.firebaseapp.com",
        projectId: "lafsys",
        storageBucket: "lafsys.appspot.com",
        messagingSenderId: "103945210522",
        appId: "1:103945210522:web:f5a51c84653a0cab10ed23",
        measurementId: "G-EJ2X0PTDNH"
    };
    firebase.initializeApp(firebaseConfig);
    // Enable persistence here (synchronously after init) so it is always set
    // before any DOMContentLoaded Firestore queries run.
    firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(() => {});
}

// Add Firebase configuration and initialization to any page that includes this script
document.addEventListener('DOMContentLoaded', function() {
    // Set up real-time listeners for specific collections
    if (typeof firebase !== 'undefined' && firebase.apps.length) {
        const db = firebase.firestore();
        
        // Set up items collection listener if on admin page
        if (window.location.pathname.includes('admin.html')) {
            console.log('Setting up items listener for admin page');
            
            // Listen for changes to the items collection
            db.collection('items').onSnapshot(snapshot => {
                console.log('Items collection changed, triggering update');
                // Dispatch an event for the admin page to handle
                window.dispatchEvent(new CustomEvent('itemsUpdated', {
                    detail: { source: 'firebase' }
                }));
            }, error => {
                console.error('Error listening to items collection:', error);
            });
        }
        
        // Set up specific item listener if on item details page
        const urlParams = new URLSearchParams(window.location.search);
        const itemId = urlParams.get('id');
        
        if (itemId && window.location.pathname.includes('item-details.html')) {
            console.log('Setting up listener for item:', itemId);
            
            // Listen for changes to this specific item
            db.collection('items').doc(itemId).onSnapshot(doc => {
                console.log('Item updated, refreshing details');
                // Dispatch an event for the item details page to handle
                window.dispatchEvent(new CustomEvent('itemUpdated', {
                    detail: { id: itemId, data: doc.exists ? doc.data() : null }
                }));
            }, error => {
                console.error('Error listening to item:', error);
            });
        }
    }
});
