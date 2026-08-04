// This file provides data functions to access Firestore
// No more hardcoded dummy data - everything comes from Firestore

// Function to get items from Firestore
async function getItems() {
    try {
        // Check if Firestore is available
        if (!firebase || !firebase.firestore) {
            console.error('Firestore is not available');
            return [];
        }
        
        const db = firebase.firestore();
        const querySnapshot = await db.collection('items').get();
        
        if (querySnapshot.empty) {
            console.log('No items found in database');
            return [];
        }
        
        // Convert the query results to an array of items
        return querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                title: data.title || 'Unnamed Item',
                description: data.description || '',
                location: data.location || 'Unknown location',
                date: data.date ? new Date(data.date) : new Date(),
                status: data.status || 'active',
                image: data.image || 'https://via.placeholder.com/300x200?text=No+Image',
                disposalDate: data.disposalDate || null,
                category: data.category || 'Uncategorized'
            };
        });
    } catch (error) {
        console.error('Error getting items:', error);
        return [];
    }
}

// Function to get item by ID from Firestore
async function getItemById(id) {
    try {
        if (!firebase || !firebase.firestore) {
            console.error('Firestore is not available');
            return null;
        }
        
        const db = firebase.firestore();
        const docRef = db.collection('items').doc(id);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            console.log(`No item found with id: ${id}`);
            return null;
        }
        
        // Convert the document to an item object
        const data = doc.data();
        
        // Helper function to properly handle Firestore timestamps
        const processTimestamp = (timestamp) => {
            if (!timestamp) return new Date();
            if (typeof timestamp.toDate === 'function') return timestamp.toDate();
            if (timestamp instanceof Date) return timestamp;
            return new Date(timestamp); // Try to parse as date string
        };
        
        return {
            id: doc.id,
            title: data.title || 'Unnamed Item',
            description: data.description || '',
            location: data.location || 'Unknown location',
            date: processTimestamp(data.date),
            status: data.status || 'active',
            image: data.image || 'https://via.placeholder.com/300x200?text=No+Image',
            additionalImages: data.additionalImages || [],
            disposalDate: data.disposalDate ? processTimestamp(data.disposalDate) : null,
            category: data.category || 'Uncategorized',
            storageLocation: data.storageLocation || '',
            foundBy: data.foundBy || '',
            createdAt: data.createdAt ? processTimestamp(data.createdAt) : new Date()
        };
    } catch (error) {
        console.error('Error getting item:', error);
        return null;
    }
}

// Function to filter items by status from Firestore
async function getItemsByStatus(status) {
    try {
        if (!firebase || !firebase.firestore) {
            console.error('Firestore is not available');
            return [];
        }
        
        const db = firebase.firestore();
        let query = db.collection('items');
        
        // Only filter if status is not 'all'
        if (status !== 'all') {
            query = query.where('status', '==', status);
        }
        
        const querySnapshot = await query.get();
        
        if (querySnapshot.empty) {
            console.log(`No items found with status: ${status}`);
            return [];
        }
        
        // Convert the query results to an array of items
        return querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                title: data.title || 'Unnamed Item',
                description: data.description || '',
                location: data.location || 'Unknown location',
                date: data.date ? new Date(data.date) : new Date(),
                status: data.status || 'active',
                image: data.image || 'https://via.placeholder.com/300x200?text=No+Image',
                disposalDate: data.disposalDate || null,
                category: data.category || 'Uncategorized'
            };
        });
    } catch (error) {
        console.error('Error getting items by status:', error);
        return [];
    }
}

// Function to search items from Firestore
async function searchItems(query) {
    try {
        if (!firebase || !firebase.firestore) {
            console.error('Firestore is not available');
            return [];
        }
        
        // If query is empty, just get all items
        if (!query.trim()) {
            return await getItems();
        }
        
        const db = firebase.firestore();
        
        // Get all items first (Firestore doesn't support full text search natively)
        const querySnapshot = await db.collection('items').get();
        
        if (querySnapshot.empty) {
            return [];
        }
        
        // Client-side filtering based on search term
        const searchTerm = query.toLowerCase();
        
        // Filter items by title, description, or location
        return querySnapshot.docs
            .map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    title: data.title || '',
                    description: data.description || '',
                    location: data.location || '',
                    date: data.date ? new Date(data.date) : new Date(),
                    status: data.status || 'active',
                    image: data.image || 'https://via.placeholder.com/300x200?text=No+Image',
                    disposalDate: data.disposalDate || null,
                    category: data.category || 'Uncategorized'
                };
            })
            .filter(item => 
                (item.title && item.title.toLowerCase().includes(searchTerm)) ||
                (item.description && item.description.toLowerCase().includes(searchTerm)) ||
                (item.location && item.location.toLowerCase().includes(searchTerm))
            );
    } catch (error) {
        console.error('Error searching items:', error);
        return [];
    }
}

// Firestore data store for admin pages
(function(){
  const w = window;
  
  console.log('Initializing DataStore...');
  
  // Create a function to get Firestore instance safely
  function getFirestoreDb() {
    if (!firebase || !firebase.firestore) {
      console.error('Firebase/Firestore not available');
      return null;
    }
    return firebase.firestore();
  }
  
  const DataStore = {
    // For compatibility with admin.js
    async getItemsAsync() {
      console.log('getItemsAsync called');
      return this.getItems();
    },
    
    // Add a new item to Firestore
    async addItem(payload) {
      const db = getFirestoreDb();
      if (!db) throw new Error('Firestore not available');
      
      try {
        const newItem = {
          title: payload.title,
          category: payload.category || 'Uncategorized',
          description: payload.description || '',
          location: payload.location || '',
          date: firebase.firestore.Timestamp.now(),
          status: payload.status || 'active',
          image: payload.image || 'https://via.placeholder.com/400x300?text=No+Image',
          disposalDate: payload.disposalDate ? firebase.firestore.Timestamp.fromDate(new Date(payload.disposalDate)) : null,
          foundBy: payload.foundBy || '',
          storageLocation: payload.storageLocation || '',
          createdAt: firebase.firestore.Timestamp.now()
        };
        
        const docRef = await db.collection('items').add(newItem);
        
        // Add the document ID to the newItem object
        newItem.id = docRef.id;
        
        console.log('Item added with ID:', docRef.id);
        
        const evt = new CustomEvent('itemsUpdated', { detail: { type: 'add', item: newItem }});
        w.dispatchEvent(evt);
        
        return newItem;
      } catch (error) {
        console.error('Error adding item:', error);
        throw error;
      }
    },
    
    // Update an existing item in Firestore
    async updateItem(id, payload) {
      const db = getFirestoreDb();
      if (!db) throw new Error('Firestore not available');
      
      try {
        const updateData = {
          ...payload,
          updatedAt: firebase.firestore.Timestamp.now()
        };
        
        // Convert date fields to Firestore timestamps if they exist
        if (payload.date) {
          updateData.date = typeof payload.date === 'string' ? 
            firebase.firestore.Timestamp.fromDate(new Date(payload.date)) : 
            payload.date;
        }
        
        if (payload.disposalDate) {
          updateData.disposalDate = typeof payload.disposalDate === 'string' ? 
            firebase.firestore.Timestamp.fromDate(new Date(payload.disposalDate)) : 
            payload.disposalDate;
        }
        
        await db.collection('items').doc(id).update(updateData);
        
        console.log('Item updated:', id);
        
        const evt = new CustomEvent('itemsUpdated', { 
          detail: { type: 'update', item: { id, ...updateData } }
        });
        w.dispatchEvent(evt);
        
        return { id, ...updateData };
      } catch (error) {
        console.error('Error updating item:', error);
        throw error;
      }
    },
    
    // Delete an item from Firestore
    async deleteItem(id) {
      const db = getFirestoreDb();
      if (!db) throw new Error('Firestore not available');
      
      try {
        await db.collection('items').doc(id).delete();
        
        console.log('Item deleted:', id);
        
        const evt = new CustomEvent('itemsUpdated', { 
          detail: { type: 'delete', id }
        });
        w.dispatchEvent(evt);
        
        return true;
      } catch (error) {
        console.error('Error deleting item:', error);
        throw error;
      }
    },
    
    // Get all items from Firestore (for admin panel use)
    async getItems() {
      console.log('DataStore.getItems called directly');
      const db = getFirestoreDb();
      if (!db) {
        console.error('Firestore not available in getItems');
        return [];
      }
      
      try {
        // Log the attempt to access Firestore
        console.log('Attempting to access Firestore collection: items');
        
        // Get all items, don't sort by createdAt since it might not exist on all documents
        const querySnapshot = await db.collection('items').get();
        
        console.log('Firestore query complete, document count:', querySnapshot.size);
        
        // Check if we got any results
        if (querySnapshot.empty) {
          console.log('No items found in Firestore');
          return [];
        }
        
        // Process and return the documents
        const items = querySnapshot.docs.map(doc => {
          const data = doc.data();
          console.log('Processing item:', doc.id, data);
          
          // Safely handle timestamps that might not exist or might not be Firestore Timestamps
          const processTimestamp = (timestamp) => {
            if (!timestamp) return new Date();
            if (typeof timestamp.toDate === 'function') return timestamp.toDate();
            if (timestamp instanceof Date) return timestamp;
            return new Date(timestamp); // Try to parse as date string
          };
          
          return {
            id: doc.id,
            title: data.title || 'Unnamed Item',
            description: data.description || '',
            location: data.location || 'Unknown location',
            category: data.category || 'Uncategorized',
            status: data.status || 'active',
            image: data.image || 'https://via.placeholder.com/300x200?text=No+Image',
            // Safely convert timestamps
            date: processTimestamp(data.date),
            disposalDate: data.disposalDate ? processTimestamp(data.disposalDate) : null,
            createdAt: data.createdAt ? processTimestamp(data.createdAt) : new Date()
          };
        });
        
        console.log('Successfully processed', items.length, 'items');
        return items;
      } catch (error) {
        console.error('Error getting items from Firestore:', error);
        // Return a test item as fallback
        return [{
          id: 'test-item-' + Date.now(),
          title: 'Test Fallback Item',
          description: 'This is a fallback item created because of an error: ' + error.message,
          location: 'Error Recovery',
          category: 'System',
          status: 'active',
          image: 'https://via.placeholder.com/300x200?text=Error+Recovery+Item',
          date: new Date(),
          createdAt: new Date()
        }];
      }
    }
  };

  // Set the DataStore on the window object immediately
  w.DataStore = DataStore;
  console.log('DataStore initialized successfully');
})();
