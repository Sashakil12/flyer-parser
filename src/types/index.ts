import { Timestamp } from 'firebase/firestore'

// Database Types

// Interface for product matches with relevance scores
export interface MatchedProduct {
  productId: string
  relevanceScore: number
  matchReason?: string
  matchedAt: Timestamp
  productData?: {
    albenianname?: string;
    albeniannameKeywords?: string[];
    categoryId?: string;
    created_at?: number | Timestamp;
    discountPercentage?: number;
    englishNameKeywords?: string[];
    iconPath?: string;
    iconUrl?: string;
    imagePath?: string;
    imageUrl?: string;
    isDeleted?: boolean;
    macedonianname?: string;
    macedoniannameKeywords?: string[];
    name?: string;
    newPrice?: string | number;
    oldPrice?: string | number;
    productId?: string;
    productType?: string;
    superMarketId?: string;
    superMarketImage?: string;
    superMarketName?: string;
    validFrom?: string;
    validTo?: string;
  }
}

export interface AutoApprovalRule {
  id: string
  name: string
  prompt: string
  isActive: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

export interface AutoApprovalDecision {
  shouldAutoApprove: boolean
  confidence: number
  reasoning: string
  matchedFields: string[]
}

export interface FlyerImage {
  id: string
  filename: string
  originalName: string
  uploadedAt: Timestamp
  createdAt: string // ISO string format for easier handling
  fileSize: number
  size: number // Alias for fileSize
  fileType: string
  storageUrl: string
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed'
  failureReason?: string // Optional reason when status is 'failed'
  uploadedBy: string
}

export interface ParsedFlyerItem {
  id: string
  flyerImageId: string // Reference to flyer-images
  productName: string
  productNameMk?: string // Macedonian product name
  productNamePrefixes: string[] // Growing prefixes for product name
  productNamePrefixesMk?: string[] // Growing prefixes for Macedonian product name
  discountPrice?: number
  discountText?: string
  discountPriceMk?: string // Macedonian discount price text
  discountStartDate?: string // ISO date string when discount starts
  discountEndDate?: string // ISO date string when discount ends
  oldPrice: number
  oldPriceMk?: string // Macedonian old price text
  currency: string // Currency code (e.g., 'USD', 'CAD', 'EUR', 'MKD')
  additionalInfo?: string[]
  additionalInfoMk?: string[] // Macedonian additional info
  confidence: number // AI confidence score (0-1)
  createdAt: Timestamp // When the item was first created
  parsedAt: Timestamp
  verified: boolean
  // Product matching fields
  matchedProducts?: MatchedProduct[] // Array of potential product matches
  selectedProductId?: string // ID of the product selected for discount application
  matchingStatus?: 'pending' | 'processing' | 'completed' | 'failed' // Status of product matching process
  matchingError?: string // Error message if matching failed
  // Auto-approval fields
  autoApproved?: boolean // Whether this item was auto-approved
  autoApprovalStatus?: 'success' | 'failed' // Status of auto-approval process
  autoApprovalReason?: string // AI reasoning for auto-approval decision
  autoApprovalFailureReason?: string // Reason why auto-approval failed
  autoApprovalConfidence?: number // AI confidence score for auto-approval (0-1)
  autoApprovedAt?: Timestamp // When auto-approval occurred
  autoApprovalFailedAt?: Timestamp // When auto-approval failed
  discountApplied?: boolean
  discountAppliedAt?: Timestamp
  discountPercentage?: number
  // Diagnostic fields for debugging matching issues
  matchingDiagnostics?: {
    searchAttempted?: boolean
    searchTimestamp?: string
    searchTerms?: any
    noMatchReason?: string
    errorTimestamp?: string
    errorType?: string
    errorReason?: string
    circuitBreakerState?: string
    failureCount?: number
    [key: string]: any
  }
  // Enhanced image extraction fields
  extractedImages?: {
    // Clean, professional product images
    clean: {
      original: string          // High-quality clean image
      optimized: string         // WebP optimized for Flutter
      thumbnail: string         // Small thumbnail
      transparent?: string      // Version with transparent background
    }
    // Multi-resolution for Flutter
    resolutions: {
      '1x': string             // 400x400 baseline
      '2x': string             // 800x800 high DPI
      '3x': string             // 1200x1200 extra high DPI
      'custom': string         // 828x440 custom resolution
    }
    // Metadata
    extractionMetadata: {
      confidence: number        // AI confidence in extraction quality
      backgroundRemoved: boolean
      textRemoved: boolean
      qualityScore: number      // Overall quality score (0-1)
      processingMethod: 'imagen4' | 'vision-api' | 'fallback'
      manualReviewRequired: boolean
    }
  }
  imageExtractionStatus?: 'pending' | 'processing' | 'completed' | 'failed' | 'manual-review'
  imageExtractionError?: string
  imageExtractedAt?: Timestamp
  imageQualityScore?: number
}

// API Response Types
export interface UploadResponse {
  success: boolean
  fileId?: string
  message: string
}

export interface ParseResponse {
  success: boolean
  data?: ParsedFlyerItem[]
  message: string
}

// Gemini AI Types
export interface GeminiParseResult {
  product_name: string
  product_name_mk?: string // Macedonian product name
  product_name_prefixes: string[] // Growing prefixes for product name
  product_name_prefixes_mk?: string[] // Growing prefixes for Macedonian product name
  discount_price?: number
  discount_text?: string
  discount_price_mk?: string // Macedonian discount price text
  discount_start_date?: string // ISO date string when discount starts
  discount_end_date?: string // ISO date string when discount ends
  old_price: number
  old_price_mk?: string // Macedonian old price text
  currency: string // Currency code detected from the image (USD, EUR, MKD, etc.)
  additional_info?: string[]
  additional_info_mk?: string[] // Macedonian additional info
}

// UI Component Types
export interface FileUploadProps {
  onUpload: (files: File[]) => Promise<void>
  isUploading: boolean
  acceptedFileTypes: string[]
  maxFiles: number
}

export interface FlyerImageCardProps {
  flyer: FlyerImage
  onDelete?: (id: string) => void
  onReprocess?: (id: string) => void
}

export interface ParsedDataTableProps {
  data: ParsedFlyerItem[]
  onEdit?: (item: ParsedFlyerItem) => void
  onDelete?: (id: string) => void
  onVerify?: (id: string) => void
}

// Form Types
export interface LoginFormData {
  email: string
  password: string
}

export interface EditParsedItemFormData {
  productName: string
  discountPrice?: number
  oldPrice: number
  additionalInfo?: string[]
  verified: boolean
}

// Auth Types
export interface User {
  uid: string
  email: string
  displayName?: string
  photoURL?: string
  role: 'admin'
}

// App State Types
export interface AppState {
  user: User | null
  isLoading: boolean
  flyerImages: FlyerImage[]
  parsedItems: ParsedFlyerItem[]
}

// Inngest Event Types
export interface FlyerParseEvent {
  name: 'flyer/parse'
  data: {
    flyerImageId: string
    storageUrl: string
    dataUrl: string
  }
}

export interface ParseStatusUpdateEvent {
  name: 'flyer/parse-status-update'
  data: {
    flyerImageId: string
    status: FlyerImage['processingStatus']
    error?: string
  }
}

export interface ProductMatchEvent {
  name: 'flyer/product-match'
  data: {
    parsedItemId: string
    flyerImageId: string
    productName: string
    productNameMk?: string
    productNamePrefixes: string[]
    productNamePrefixesMk?: string[]
    additionalInfo?: string[]
    additionalInfoMk?: string[]
    batchId?: string // For batch processing to avoid overload
  }
}

export interface ProductMatchStatusUpdateEvent {
  name: 'flyer/product-match-status-update'
  data: {
    parsedItemId: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    error?: string
  }
}

export interface FlyerImageExtractionEvent {
  name: 'flyer/extract-images'
  data: {
    flyerImageId: string
    storageUrl: string
    originalImageDimensions: {
      width: number
      height: number
    }
    parsedItems: Array<{
      id: string
      productName: string
      productNameMk?: string
      discountPrice?: number
      oldPrice: number
      additionalInfo?: string[]
      // AI-suggested region coordinates (if available from parsing)
      suggestedRegion?: {
        x: number
        y: number
        width: number
        height: number
        confidence: number
      }
    }>
  }
}

// Image extraction types
export interface ProductExtractionConfig {
  removeText: boolean
  removePromotionalElements: boolean
  backgroundStyle: 'white' | 'transparent' | 'gradient'
  productCentering: boolean
  shadowGeneration: boolean
  qualityEnhancement: boolean
}

export interface CleanProductImage {
  itemId: string
  originalRegion: {
    x: number
    y: number
    width: number
    height: number
  }
  extractedImageData: string
  confidence: number
  qualityScore: number
  processingMethod: 'imagen4' | 'vision-api' | 'fallback'
  backgroundRemoved: boolean
  textRemoved: boolean
  manualReviewRequired: boolean
}

export interface ImageOptimizationResult {
  original: string
  optimized: string
  thumbnail: string
  transparent?: string
  resolutions: {
    '1x': string
    '2x': string
    '3x': string
    'custom': string         // 828x440 custom resolution
  }
}

// Error Types
export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message)
    this.name = 'AppError'
  }
}

// Utility Types
export type ProcessingStatus = FlyerImage['processingStatus']
export type UserRole = User['role']
export type InngestEventName = FlyerParseEvent['name'] | ParseStatusUpdateEvent['name'] | ProductMatchEvent['name'] | ProductMatchStatusUpdateEvent['name'] | FlyerImageExtractionEvent['name']
