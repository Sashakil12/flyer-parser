# Flyer Parser App

An AI-powered application that automatically parses and extracts product information from retail store flyers using Google Gemini Pro, Firebase, and Inngest workflows.

## 🚀 Features

- **AI-Powered Parsing**: Uses Google Gemini Pro for accurate text and price extraction.
- **AI-Powered Discount Calculation**: Intelligently calculates discounts from unstructured text (e.g., "30% OFF", "Save $5").
- **Configurable Auto-Approval**: Define custom, AI-driven rules to automatically approve product matches.
- **Asynchronous Processing**: Inngest workflows for scalable background processing.
- **Real-time Updates**: Live status tracking of parsing jobs.
- **Server-Side Filtering**: Efficiently filter parsed items on the backend.
- **Multi-file Upload**: Batch upload capability with a beautified drag-and-drop interface.
- **Admin Authentication**: Secure email/password authentication via Firebase.
- **Cloud Storage**: Firebase Storage for secure file management.
- **Modern UI**: Beautiful, responsive interface built with Next.js and Tailwind CSS, featuring loading skeletons and a sticky header.

## 🛠 Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Firebase (Auth, Firestore, Storage), Inngest
- **AI**: Google Gemini Pro
- **Caching**: Redis
- **UI Components**: Heroicons, React Hot Toast, React Dropzone

## Key Workflows

1.  **Flyer Upload**: An admin uploads one or more flyer images.
2.  **AI Parsing**: An Inngest workflow is triggered. It uses Gemini to parse each image, extracting product details and any unstructured discount text (e.g., "2 for 1").
3.  **Product Matching**: For each parsed item, a search is performed against the existing product database to find potential matches.
4.  **AI Scoring**: The potential matches are sent to Gemini, which scores their relevance and determines if they meet the active auto-approval rule.
5.  **Auto-Approval & Discounting**:
    *   If a single, high-confidence match is found and it meets the auto-approval criteria, the system links the parsed item to the product.
    *   If a discount was parsed, a second AI call is made to calculate the final price, which is then updated in the database.
    *   If multiple high-confidence matches are found, the item is flagged for manual review to prevent errors.
6.  **Manual Review**: Admins can use the dashboard to review items that were not auto-approved, see the potential matches, and manually apply discounts.

## 📋 Prerequisites

Before you begin, ensure you have:

- Node.js 18+ installed
- pnpm package manager
- Firebase project with Auth, Firestore, and Storage enabled
- Google AI API key
- Inngest account

## 🔧 Installation

1.  **Clone the repository**
    ```bash
    git clone <repository-url>
    cd badiyala-flyer-parser
    ```

2.  **Install dependencies**
    ```bash
    pnpm install
    ```

3.  **Set up environment variables**
    
    Copy `.env.example` to `.env.local` and fill in your credentials.

4.  **Firebase, Google AI, and Inngest Setup**
    
    Follow the setup instructions in the official documentation for each service.

## 🚀 Development

1.  **Start the development server**
    ```bash
    pnpm dev
    ```

2.  **Access the application**
    - Open http://localhost:3000 in your browser

3.  **Inngest Development**
    ```bash
    # In a separate terminal, run Inngest dev server
    npx inngest-cli@latest dev
    ```

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── auto-approval/     # Page for managing approval rules
│   └── parsed-items/      # Page for viewing parsed items
├── components/            # React components
├── lib/                   # Utility libraries
│   ├── config.ts          # Client-side environment variables
│   ├── config.server.ts   # Server-side environment variables
│   ├── gemini-discount.ts # AI-powered discount calculation
└── types/                # TypeScript type definitions
```

## 📊 Database Schema

### Collection: `flyer-images`
```typescript
interface FlyerImage {
  id: string
  filename: string
  storageUrl: string
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed'
  // ... and other fields
}
```

### Collection: `parsed-flyer-items`
```typescript
interface ParsedFlyerItem {
  id: string
  flyerImageId: string
  productName: string
  discountPrice?: number
  discountText?: string // e.g., "30% OFF"
  oldPrice: number
  autoApproved?: boolean
  autoApprovalStatus?: 'success' | 'failed'
  autoApprovalReason?: string
  // ... and other fields
}
```

---

Built with ❤️ using Next.js, Firebase, and Google Gemini AI