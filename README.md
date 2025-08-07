# Super Shop Flyer Parser App

An AI-powered application that automatically parses and extracts product information from retail store flyers using Google Gemini Pro 2.5, Firebase, and Inngest workflows.

## 🚀 Features

- **AI-Powered Parsing**: Uses Google Gemini Pro 2.5 for accurate text and price extraction
- **Asynchronous Processing**: Inngest workflows for scalable background processing
- **Real-time Updates**: Live status tracking of parsing jobs
- **Multi-file Upload**: Batch upload capability with drag-and-drop interface
- **Admin Authentication**: Secure email/password authentication via Firebase
- **Cloud Storage**: Firebase Storage for secure file management
- **Modern UI**: Beautiful, responsive interface built with Next.js and Tailwind CSS

## 🛠 Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Firebase (Auth, Firestore, Storage), Inngest
- **AI**: Google Gemini Pro 2.5
- **UI Components**: Heroicons, React Hot Toast, React Dropzone

## 📋 Prerequisites

Before you begin, ensure you have:

- Node.js 18+ installed
- pnpm package manager
- Firebase project with Auth, Firestore, and Storage enabled
- Google AI API key (for Gemini Pro 2.5)
- Inngest account (for workflow processing)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd badiyala-flyer-parser
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   
   Copy `.env.example` to `.env.local` and fill in your credentials:

   ```bash
   # Firebase Configuration
   NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

   # Firebase Admin SDK
   FIREBASE_CLIENT_EMAIL=your_service_account_email
   FIREBASE_PRIVATE_KEY="your_private_key_with_newlines"

   # Google AI (Gemini Pro 2.5)
   GOOGLE_AI_API_KEY=your_google_ai_api_key

   # Inngest
   INNGEST_EVENT_KEY=your_inngest_event_key
   INNGEST_SIGNING_KEY=your_inngest_signing_key

   # App Settings
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

4. **Firebase Setup**

   a. Create a Firebase project at https://console.firebase.google.com
   
   b. Enable Authentication with Email/Password provider
   
   c. Create Firestore database with the following collections:
      - `flyer-images`
      - `parsed-flyer-items`
   
   d. Enable Firebase Storage
   
   e. Download service account key and add credentials to environment variables

5. **Google AI Setup**
   
   a. Get API key from https://makersuite.google.com/app/apikey
   
   b. Add the API key to your environment variables

6. **Inngest Setup**
   
   a. Sign up at https://www.inngest.com
   
   b. Create a new app and get your event and signing keys
   
   c. Add keys to environment variables

## 🚀 Development

1. **Start the development server**
   ```bash
   pnpm dev
   ```

2. **Access the application**
   - Open http://localhost:3000 in your browser
   - Use Firebase Auth to create admin accounts

3. **Inngest Development**
   ```bash
   # In a separate terminal, run Inngest dev server
   npx inngest-cli@latest dev
   ```

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   └── inngest/       # Inngest endpoints
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx          # Home page
├── components/            # React components
│   ├── auth/             # Authentication components
│   ├── dashboard/        # Dashboard components
│   └── ui/               # Reusable UI components
├── lib/                   # Utility libraries
│   ├── firebase/         # Firebase configuration
│   ├── inngest/          # Inngest functions
│   ├── auth.ts           # Authentication service
│   ├── firestore.ts      # Firestore operations
│   ├── gemini.ts         # Gemini AI service
│   ├── inngest.ts        # Inngest client
│   └── storage.ts        # Firebase Storage operations
└── types/                # TypeScript type definitions
    └── index.ts
```

## 🔄 How It Works

1. **Upload**: Admin uploads flyer images via drag-and-drop interface
2. **Store**: Files are saved to Firebase Storage with metadata in Firestore
3. **Queue**: Inngest workflow is triggered with image data URL
4. **Parse**: Gemini Pro 2.5 analyzes the image and extracts product data
5. **Save**: Parsed data is structured and saved to Firestore
6. **Update**: Processing status is updated in real-time

## 📊 Database Schema

### Collection: `flyer-images`
```typescript
interface FlyerImage {
  id: string
  filename: string
  uploadedAt: Timestamp
  fileSize: number
  fileType: string
  storageUrl: string
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed'
  uploadedBy: string
}
```

### Collection: `parsed-flyer-items`
```typescript
interface ParsedFlyerItem {
  id: string
  flyerImageId: string
  productName: string
  discountPrice?: number
  oldPrice: number
  additionalInfo?: string[]
  confidence: number
  parsedAt: Timestamp
  verified: boolean
}
```

## 🚀 Deployment

1. **Build the application**
   ```bash
   pnpm build
   ```

2. **Deploy to Vercel** (recommended)
   ```bash
   npx vercel
   ```

3. **Configure environment variables** in your deployment platform

4. **Set up Inngest** production endpoints in your Inngest dashboard

## 🧪 Testing

- **Type checking**: `pnpm type-check`
- **Linting**: `pnpm lint`
- **Testing**: Add your preferred testing framework

## 📝 API Endpoints

- `POST /api/inngest/trigger-parse` - Trigger AI parsing workflow
- `GET/POST /api/inngest` - Inngest webhook endpoints

## 🔒 Security Features

- Firebase Authentication with admin-only access
- Secure file upload with validation
- Private Firebase Storage rules
- Environment variable protection
- CORS and API security

## 🐛 Troubleshooting

**Common Issues:**

1. **Firebase connection issues**
   - Check your Firebase configuration
   - Ensure all required services are enabled
   - Verify API keys and permissions

2. **Gemini AI parsing errors**
   - Check your Google AI API key
   - Verify API quotas and limits
   - Ensure image quality is sufficient

3. **Inngest workflow issues**
   - Check Inngest configuration and keys
   - Verify webhook endpoints
   - Monitor function logs in Inngest dashboard

## 📄 License

This project is licensed under the ISC License.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📞 Support

For support and questions:
- Check the documentation
- Review Firebase and Inngest logs
- Monitor application console for errors

---

Built with ❤️ using Next.js, Firebase, and Google Gemini AI
