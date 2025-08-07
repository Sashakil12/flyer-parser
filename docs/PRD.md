# Flyer Parser App

## Project Overview

A sophisticated AI-powered application designed to automatically parse and extract product information from retail store flyers. The system leverages advanced computer vision and natural language processing to digitize promotional content efficiently.

## Purpose

Automate the extraction of product details, pricing information, and promotional data from store flyers to enable better inventory management, price tracking, and competitive analysis.

## Technology Stack

| Component | Technology | Details |
|-----------|------------|--------|
| **Frontend Framework** | Next.js | Latest version |
| **Workflow Engine** | Inngest | Background job processing |
| **AI Model** | Google Gemini Pro 2.5 | Image analysis and OCR |
| **Database** | Firestore | NoSQL document database |
| **File Storage** | Firebase Storage | Cloud file storage |
| **Authentication** | Firebase Auth | Email/password |

## Core Features

### 1. Authentication System
- **Email/Password Authentication**: Secure admin login system
- **Single Admin Role**: Simplified role management with admin-only access
- **Session Management**: Secure authentication state handling

### 2. File Management
- **Multi-file Upload**: Batch upload capability for flyer images
- **Firebase Storage**: Secure cloud storage for uploaded files
- **Metadata Tracking**: Complete file information stored in Firestore
- **Supported Formats**: JPEG, PNG, WebP image formats

### 3. AI-Powered Parsing
- **Gemini Pro 2.5**: Advanced image analysis and text extraction
- **Inngest Workflows**: Asynchronous processing pipeline
- **Intelligent OCR**: Accurate text and price recognition
- **Structured Output**: JSON-formatted extraction results

### 4. Data Management
- **Firestore Database**: Scalable NoSQL data storage
- **Relational Design**: Linked data between images and parsed content
- **Real-time Updates**: Live status tracking of processing jobs

## Database Schema

### Collection: `flyer-images`
```typescript
interface FlyerImage {
  id: string;
  filename: string;
  uploadedAt: Timestamp;
  fileSize: number;
  fileType: string;
  storageUrl: string;
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  uploadedBy: string;
}
```

### Collection: `parsed-flyer-items`
```typescript
interface ParsedFlyerItem {
  id: string;
  flyerImageId: string; // Reference to flyer-images
  productName: string;
  discountPrice?: number;
  oldPrice: number;
  additionalInfo?: string[];
  confidence: number; // AI confidence score (0-1)
  parsedAt: Timestamp;
  verified: boolean; // Manual verification status
}
```

## AI Processing Workflow

### Gemini Pro 2.5 Prompt
```json
{
  "system": "You are an expert at analyzing retail store flyers and extracting product information with high accuracy.",
  "prompt": "Analyze this store flyer image and extract product information. Return a valid JSON object with the following structure:",
  "schema": {
    "product_name": {
      "type": "string",
      "required": true,
      "description": "Complete product name as shown on the flyer"
    },
    "discount_price": {
      "type": "number",
      "required": false,
      "description": "Current sale/promotional price if available"
    },
    "old_price": {
      "type": "number",
      "required": true,
      "description": "Original/regular price (use this if only one price is shown)"
    },
    "additional_info": {
      "type": "array",
      "items": "string",
      "required": false,
      "description": "Additional product details, brand names, or promotional text"
    }
  },
  "instructions": [
    "Extract all visible product information accurately",
    "Be precise with numerical price values",
    "Include brand names when clearly visible",
    "Capture any promotional conditions or restrictions",
    "Return valid JSON format only"
  ]
}
```

## Processing Pipeline

1. **Upload** → Admin uploads flyer image(s) via web interface
2. **Store** → Files saved to Firebase Storage with metadata
3. **Record** → File information stored in `flyer-images` collection
4. **Queue** → Inngest workflow triggered with storage URL reference for AI processing
5. **Analyze** → Gemini Pro 2.5 processes the image
6. **Extract** → Product data extracted and validated
7. **Save** → Parsed data stored in `parsed-flyer-items` collection with relation to `flyer-images`
8. **Update** → Processing status updated in real-time

## Enhanced Features

### Dashboard & Analytics
- **Processing Statistics**: Real-time metrics showing success rates, processing times
- **Status Overview**: Visual breakdown of pending, processing, completed, and failed jobs
- **Performance Monitoring**: System health and processing efficiency tracking

### Data Management
- **Manual Verification**: Admin can verify/unverify parsed product data
- **CRUD Operations**: Complete data management for images and parsed items
- **Bulk Processing**: Efficient handling of multiple flyer uploads
- **Data Relationships**: Proper linking between flyer images and extracted products

### User Experience
- **Drag-and-Drop Upload**: Intuitive file upload with progress indicators
- **Real-time Updates**: Live status tracking without page refreshes
- **Error Recovery**: User-friendly error handling and retry mechanisms
- **Responsive Design**: Mobile-friendly interface for all device sizes

## Success Metrics

- **Accuracy**: >95% correct product name extraction
- **Price Detection**: >90% accurate price recognition
- **Processing Time**: <2 minutes per flyer
- **System Uptime**: 99.9% availability target