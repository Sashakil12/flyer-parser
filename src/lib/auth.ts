import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth'
import { auth } from './firebase/config'
import { User } from '@/types'

/**
 * Signs in a user with email and password
 */
export const signIn = async (email: string, password: string): Promise<User> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    const firebaseUser = userCredential.user
    
    // For now, all authenticated users are admins (as per PRD requirement)
    const user: User = {
      uid: firebaseUser.uid,
      email: firebaseUser.email!,
      role: 'admin'
    }
    
    return user
  } catch (error: any) {
    console.error('Sign in error:', error)
    throw new Error(getAuthErrorMessage(error.code))
  }
}

/**
 * Signs out the current user
 */
export const signOut = async (): Promise<void> => {
  try {
    await firebaseSignOut(auth)
    console.log('User successfully signed out')
  } catch (error: any) {
    console.error('Sign out error:', error)
    throw new Error('Failed to sign out')
  }
}

/**
 * Subscribes to authentication state changes
 */
export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
    if (firebaseUser) {
      const user: User = {
        uid: firebaseUser.uid,
        email: firebaseUser.email!,
        role: 'admin'
      }
      callback(user)
    } else {
      callback(null)
    }
  })
}

/**
 * Gets current authenticated user
 */
export const getCurrentUser = (): User | null => {
  const firebaseUser = auth.currentUser
  if (firebaseUser) {
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email!,
      role: 'admin'
    }
  }
  return null
}

/**
 * Helper function to get user-friendly error messages
 */
const getAuthErrorMessage = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/user-not-found':
      return 'No user found with this email address.'
    case 'auth/wrong-password':
      return 'Incorrect password.'
    case 'auth/invalid-email':
      return 'Invalid email address.'
    case 'auth/user-disabled':
      return 'This user account has been disabled.'
    case 'auth/too-many-requests':
      return 'Too many failed login attempts. Please try again later.'
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.'
    default:
      return 'Authentication failed. Please try again.'
  }
}
