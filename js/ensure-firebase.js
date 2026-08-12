// Ensure Firebase is properly initialized
document.addEventListener('DOMContentLoaded', () => {
    console.log('Checking Firebase configuration...');
    
    // Only initialize if not already initialized
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) {
        console.log('Firebase not initialized. Attempting to initialize with default config...');
        try {
            // Use the same Firebase configuration as item-init.js
            const firebaseConfig = {
                apiKey: "AIzaSyBGH1-fruNM0GPOLpOjfOIxHpLgqzt8fe0",
                authDomain: "lafsys.firebaseapp.com",
                projectId: "lafsys",
                storageBucket: "lafsys.appspot.com",
                messagingSenderId: "103945210522",
                appId: "1:103945210522:web:f5a51c84653a0cab10ed23",
                measurementId: "G-EJ2X0PTDNH"
            };
            
            // Initialize Firebase
            firebase.initializeApp(firebaseConfig);
            console.log('Firebase initialized successfully with project: lafsys');
        } catch (error) {
            console.error('Error initializing Firebase:', error);
        }
    } else {
        console.log('Firebase is already initialized');
    }
    
    // Persistence is enabled in item-init.js right after initializeApp (before any queries)
});
