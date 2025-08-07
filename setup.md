# Quick Setup Guide

## 1. Install Dependencies

```bash
pnpm install
```

## 2. Environment Setup

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in the required environment variables in `.env.local`

## 3. Firebase Setup

### Step 1: Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project
3. Enable Authentication, Firestore, and Storage

### Step 2: Configure Authentication
1. Go to Authentication > Sign-in method
2. Enable "Email/Password" provider

### Step 3: Configure Firestore
1. Go to Firestore Database
2. Create database in production mode
3. Set up security rules (basic rules for now):
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

### Step 4: Configure Storage
1. Go to Storage
2. Set up security rules:
   ```javascript
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /{allPaths=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

### Step 5: Get Firebase Config
1. Go to Project Settings > General
2. Scroll down to "Your apps"
3. Add a web app if not already added
4. Copy the config values to your `.env.local`

### Step 6: Generate Service Account Key
1. Go to Project Settings > Service accounts
2. Click "Generate new private key"
3. Download the JSON file
4. Copy the `client_email` and `private_key` to `.env.local`

## 4. Google AI Setup

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create an API key
3. Add the API key to `.env.local`

## 5. Inngest Setup

1. Sign up at [Inngest](https://www.inngest.com)
2. Create a new app
3. Get your Event Key and Signing Key
4. Add them to `.env.local`

## 6. Create Admin User

1. Start the development server:
   ```bash
   pnpm dev
   ```

2. Go to http://localhost:3000
3. Use Firebase Console > Authentication to create an admin user
4. Or implement a signup flow if needed

## 7. Test the Application

1. Upload a flyer image
2. Check that it processes correctly
3. Verify data appears in Firestore

## 8. Development Commands

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm type-check` - Check TypeScript types

## Troubleshooting

### Firebase Issues
- Check your API keys and project configuration
- Verify security rules allow authenticated access
- Check browser console for detailed errors

### Gemini AI Issues
- Verify your Google AI API key is valid
- Check API quotas and limits
- Ensure images are in supported formats

### Inngest Issues
- Check webhook configuration
- Verify signing keys are correct
- Monitor function logs in Inngest dashboard

## Next Steps

1. Customize the UI to match your branding
2. Add more sophisticated error handling
3. Implement user roles if needed
4. Add email notifications for processing completion
5. Set up production deployment
