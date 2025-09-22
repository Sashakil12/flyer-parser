import { adminDb } from './src/lib/firebase/admin.ts';

async function cleanupProductIds() {
  try {
    console.log('Connecting to Firestore and fetching all products...');
    const productsRef = adminDb.collection('products');
    const snapshot = await productsRef.get();

    if (snapshot.empty) {
      console.log('No products found.');
      return;
    }

    console.log(`Found ${snapshot.docs.length} total products. Analyzing for whitespace issues...`);

    const batch = adminDb.batch();
    let productsToUpdate = 0;

    snapshot.docs.forEach(doc => {
      const product = doc.data();
      const originalProductId = product.productId;

      if (originalProductId && typeof originalProductId === 'string') {
        const trimmedProductId = originalProductId.trim();
        
        if (originalProductId !== trimmedProductId) {
          console.log(`Found product with whitespace issue. Doc ID: ${doc.id}`);
          console.log(`  - Original: "${originalProductId}"`);
          console.log(`  - Trimmed:  "${trimmedProductId}"`);
          
          const docRef = productsRef.doc(doc.id);
          batch.update(docRef, { productId: trimmedProductId });
          productsToUpdate++;
        }
      }
    });

    if (productsToUpdate === 0) {
      console.log('\n✅ No products with whitespace issues found. Your database is clean!');
      return;
    }

    console.log(`\nFound ${productsToUpdate} product(s) with whitespace issues. Committing updates...`);
    await batch.commit();
    console.log(`\n✅ Successfully updated ${productsToUpdate} product(s).`);

  } catch (error) {
    console.error('❌ An error occurred during the cleanup process:', error);
  }
}

cleanupProductIds();
