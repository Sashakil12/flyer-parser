import admin from 'firebase-admin'
import path from 'path'
import fs from 'fs'

// Initialize Firebase Admin SDK
try {
  if (!admin.apps.length) {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json'
    
    // Try to read service account file first
    if (fs.existsSync(serviceAccountPath)) {
      console.log('📋 Loading Firebase service account from:', serviceAccountPath)
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      })
      console.log('✅ Firebase Admin initialized with service account file')
    } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      // Use environment variables as fallback
      console.log('📋 Loading Firebase service account from environment variables')
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      })
      console.log('✅ Firebase Admin initialized with environment variables')
    } else {
      throw new Error('Neither service account file nor environment variables found for Firebase Admin')
    }
  }
} catch (error) {
  console.error('❌ Firebase admin initialization error:', error)
  throw error
}

// Export admin instances
export const adminAuth = admin.auth()
export const adminDb = admin.firestore()
export const adminStorage = admin.storage()

export default admin
