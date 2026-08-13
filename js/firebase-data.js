/**
 * Firebase Data Integration for LAF System
 * 
 * This script adds Firebase integration to the DataStore, allowing
 * items to be loaded from Firebase Firestore.
 */

(function() {
    console.log('Firebase Data integration initializing...');
    
    let attempts = 0;
    const maxAttempts = 100; // 10 seconds total
    
    // Wait for both Firebase AND DataStore to be available
    const checkFirebase = setInterval(() => {
        attempts++;
        
        if (typeof firebase !== 'undefined' && firebase.apps.length && firebase.firestore && window.DataStore) {
            clearInterval(checkFirebase);
            console.log('Firebase and DataStore detected, initializing data integration...');
            initializeFirebaseIntegration();
        } else if (attempts >= maxAttempts) {
            clearInterval(checkFirebase);
            console.error('Initialization timeout after', attempts * 100, 'ms');
            console.error('Status:', {
                firebaseExists: typeof firebase !== 'undefined',
                appsLength: firebase && firebase.apps ? firebase.apps.length : 0,
                firestoreExists: firebase && firebase.firestore ? true : false,
                dataStoreExists: !!window.DataStore
            });
        } else if (attempts % 10 === 0) {
            // Log progress every second
            console.log('Waiting for initialization... (attempt', attempts + ')', {
                firebase: typeof firebase !== 'undefined',
                apps: firebase && firebase.apps ? firebase.apps.length : 0,
                firestore: firebase && firebase.firestore ? true : false,
                dataStore: !!window.DataStore
            });
        }
    }, 100);
    
    function initializeFirebaseIntegration() {
        console.log('Initializing Firebase data integration');
        
        const db = firebase.firestore();
        
        // Only modify DataStore if it exists
        if (!window.DataStore) {
            console.error('DataStore not found, cannot integrate Firebase');
            return;
        }
        
        // Extend the DataStore with Firebase-backed methods
        const originalDataStore = { ...window.DataStore };
        
        // Get items from Firebase
        async function getItemsFromFirebase() {
            try {
                const snapshot = await db.collection('items').orderBy('date', 'desc').get();
                const items = [];
                
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.status === 'archived') return; // hidden from users
                    items.push({
                        id: doc.id,
                        title: data.title || 'Untitled',
                        description: data.description || '',
                        location: data.location || '',
                        category: data.category || '',
                        date: data.date || new Date().toISOString(),
                        status: data.status || 'active',
                        image: data.image || 'https://via.placeholder.com/400x300?text=No+Image',
                        additionalImages: data.additionalImages || [],
                        disposalDate: data.disposalDate || '',
                        storageLocation: data.storageLocation || '',
                        foundBy: data.foundBy || ''
                    });
                });
                
                console.log(`Loaded ${items.length} items from Firebase`);
                return items;
            } catch (error) {
                console.error('Error getting items from Firebase:', error);
                // Fall back to original data if Firebase fails
                return originalDataStore.getItemsSync();
            }
        }
        
        // Get a single item from Firebase by ID
        async function getItemFromFirebase(id) {
            try {
                const doc = await db.collection('items').doc(id).get();
                
                if (!doc.exists) {
                    return null;
                }
                
                const data = doc.data();
                return {
                    id: doc.id,
                    title: data.title || 'Untitled',
                    description: data.description || '',
                    location: data.location || '',
                    category: data.category || '',
                    date: data.date || new Date().toISOString(),
                    status: data.status || 'active',
                    image: data.image || 'https://via.placeholder.com/400x300?text=No+Image',
                    additionalImages: data.additionalImages || [],
                    disposalDate: data.disposalDate || '',
                    storageLocation: data.storageLocation || '',
                    foundBy: data.foundBy || ''
                };
            } catch (error) {
                console.error('Error getting item from Firebase:', error);
                return null;
            }
        }
        
        // Add async versions of DataStore methods
        const FirebaseDataStore = {
            // Original methods (preserved)
            ...originalDataStore,
            
            // New async methods
            async getItemsAsync() {
                return await getItemsFromFirebase();
            },
            
            async getItemAsync(id) {
                return await getItemFromFirebase(id);
            },
            
            // Override getItemsSync to merge Firebase items with local items
            getItemsSync() {
                // Return the original items while we fetch Firebase items
                const originalItems = originalDataStore.getItemsSync();
                
                // Load Firebase items in the background
                getItemsFromFirebase().then(firebaseItems => {
                    // Update DataStore items with Firebase items
                    // Extend the array with new items from Firebase
                    // (keeping both original and Firebase items)
                    const combinedItems = [...originalItems];
                    
                    // Add Firebase items that don't already exist in the array
                    firebaseItems.forEach(firebaseItem => {
                        if (!combinedItems.some(item => item.id === firebaseItem.id)) {
                            combinedItems.push(firebaseItem);
                        }
                    });
                    
                    // Update the DataStore
                    window.DataStore.items = combinedItems;
                    
                    // Trigger update event
                    window.dispatchEvent(new CustomEvent('itemsUpdated', { 
                        detail: { type: 'sync', source: 'firebase' } 
                    }));
                });
                
                return originalItems;
            },
            
            // Add real-time updates
            setupRealtimeUpdates() {
                console.log('Setting up real-time updates for items');
                
                // Listen for changes to the items collection
                db.collection('items')
                    .onSnapshot(snapshot => {
                        const changes = [];
                        
                        snapshot.docChanges().forEach(change => {
                            const item = {
                                id: change.doc.id,
                                ...change.doc.data()
                            };
                            
                            if (change.type === 'added') {
                                changes.push({ type: 'added', item });
                            } else if (change.type === 'modified') {
                                changes.push({ type: 'modified', item });
                            } else if (change.type === 'removed') {
                                changes.push({ type: 'removed', itemId: change.doc.id });
                            }
                        });
                        
                        if (changes.length > 0) {
                            // Process the changes
                            this.processChanges(changes);
                        }
                    }, error => {
                        console.error('Error in real-time updates:', error);
                    });
            },
            
            // Process changes from real-time updates
            processChanges(changes) {
                // Get the current items
                const currentItems = [...window.DataStore.items];
                
                changes.forEach(change => {
                    if (change.type === 'added') {
                        // Check if item already exists
                        const existingIndex = currentItems.findIndex(item => item.id === change.item.id);
                        if (existingIndex >= 0) {
                            // Update existing item
                            currentItems[existingIndex] = change.item;
                        } else {
                            // Add new item
                            currentItems.push(change.item);
                        }
                    } else if (change.type === 'modified') {
                        // Find and update the item
                        const index = currentItems.findIndex(item => item.id === change.item.id);
                        if (index >= 0) {
                            currentItems[index] = change.item;
                        }
                    } else if (change.type === 'removed') {
                        // Remove the item
                        const index = currentItems.findIndex(item => item.id === change.itemId);
                        if (index >= 0) {
                            currentItems.splice(index, 1);
                        }
                    }
                });
                
                // Update the DataStore
                window.DataStore.items = currentItems;
                
                // Trigger update event
                window.dispatchEvent(new CustomEvent('itemsUpdated', { 
                    detail: { type: 'realtimeUpdate', changes } 
                }));
            }
        };
        
        // Replace the DataStore with the extended version
        window.DataStore = FirebaseDataStore;
        
        // Set up real-time updates
        FirebaseDataStore.setupRealtimeUpdates();
        
        console.log('Firebase data integration complete');
        
        // Immediately trigger a first load
        FirebaseDataStore.getItemsAsync().then(items => {
            console.log(`Initial Firebase load complete: ${items.length} items`);
            
            // Update stats
            if (typeof renderStats === 'function') {
                renderStats();
            }
            
            // Update items displays
            if (typeof renderAllItems === 'function') {
                renderAllItems();
            }
            
            if (typeof renderRecentItems === 'function') {
                renderRecentItems();
            }
        });
    }
})();
