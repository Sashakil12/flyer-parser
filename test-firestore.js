// Direct test of Firestore operations
const admin = require('firebase-admin');

// Initialize Firebase Admin (simplified)
if (!admin.apps.length) {
  // This assumes you have FIREBASE_SERVICE_ACCOUNT_PATH or env vars set
  admin.initializeApp();
}

const db = admin.firestore();

async function testFirestoreOperations() {
  try {
    console.log('🧪 Testing Firestore operations...');
    
    // Test 1: Update a pending flyer to processing
    const testImageId = '8we2bFOcByHhqdDtLLek'; // From your log
    
    console.log(`📝 Updating ${testImageId} to processing...`);
    await db.collection('flyer-images').doc(testImageId).update({
      status: 'processing',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('✅ Status updated to processing');
    
    // Test 2: Create a sample parsed item
    console.log('📝 Creating sample parsed item...');
    const parsedItem = {
      flyerImageId: testImageId,
      productName: 'Test Product',
      discountPrice: 19.99,
      oldPrice: 29.99,
      additionalInfo: ['Test info'],
      confidence: 0.95,
      verified: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      parsedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const docRef = await db.collection('parsed-flyer-items').add(parsedItem);
    console.log('✅ Parsed item created with ID:', docRef.id);
    
    // Test 3: Update status to completed
    console.log(`📝 Updating ${testImageId} to completed...`);
    await db.collection('flyer-images').doc(testImageId).update({
      status: 'completed',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('✅ Status updated to completed');
    console.log('🎉 All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    process.exit(0);
  }
}

testFirestoreOperations();
