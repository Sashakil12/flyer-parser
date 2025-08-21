// src/lib/config.server.ts
/**
 * A centralized configuration module for server-side environment variables.
 * Reads and validates all environment variables at startup.
 */

// Helper function to ensure required variables are present
function getEnv(key: string, required: boolean = true): string {
  const value = process.env[key];
  if (required && (value === undefined || value === '')) {
    // Use a console error in server environments
    console.error(`FATAL: Missing required environment variable: ${key}`);
    // In a real server environment, you might throw an error to prevent startup
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

const serverConfig = {
  firebase: {
    apiKey: getEnv('NEXT_PUBLIC_FIREBASE_API_KEY'),
    authDomain: getEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: getEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: getEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getEnv('NEXT_PUBLIC_FIREBASE_APP_ID'),
    
    // Server-side only
    serviceAccountPath: getEnv('FIREBASE_SERVICE_ACCOUNT_PATH', false), // Not required if using client/private key
    clientEmail: getEnv('FIREBASE_CLIENT_EMAIL', false),
    privateKey: getEnv('FIREBASE_PRIVATE_KEY', false),
  },
  google: {
    apiKey: getEnv('GOOGLE_AI_API_KEY'),
  },
  redis: {
    url: getEnv('REDIS_URL', false), // Not strictly required for the app to run
  },
};

// Deep freeze the config object to prevent runtime mutations
const deepFreeze = (obj: any) => {
  Object.keys(obj).forEach(prop => {
    if (typeof obj[prop] === 'object' && !Object.isFrozen(obj[prop])) {
      deepFreeze(obj[prop]);
    }
  });
  return Object.freeze(obj);
};

export const appConfigServer = deepFreeze(serverConfig);
