import admin from 'firebase-admin'
import path from 'path'
import fs from 'fs'
import { appConfigServer } from '../config.server'

// Initialize Firebase Admin SDK
try {
  if (!admin.apps.length) {
    const { serviceAccountPath, clientEmail, privateKey, projectId, storageBucket } = appConfigServer.firebase;
    
    // Try to read service account file first
    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      console.log('📋 Loading Firebase service account from:', serviceAccountPath)
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: storageBucket,
      })
      console.log('✅ Firebase Admin initialized with service account file')
    } else if (clientEmail && privateKey) {
      // Use environment variables as fallback
      console.log('📋 Loading Firebase service account from environment variables')
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: projectId,
          clientEmail: clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
        storageBucket: storageBucket,
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
