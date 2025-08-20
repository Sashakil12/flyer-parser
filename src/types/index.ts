import { Timestamp } from 'firebase/firestore'

// Database Types

// Interface for product matches with relevance scores
export interface MatchedProduct {
  productId: string
  relevanceScore: number
  matchReason?: string
  matchedAt: Timestamp
  productData?: {
    name: string
    macedonianname?: string
    albenianname?: string
    iconUrl?: string
    superMarketName?: string
    categoryId?: string
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
  discountPriceMk?: string // Macedonian discount price text
  discountStartDate?: string // ISO date string when discount starts
  discountEndDate?: string // ISO date string when discount ends
  oldPrice: number
  oldPriceMk?: string // Macedonian old price text
  currency: string // Currency code (e.g., 'USD', 'CAD', 'EUR', 'MKD')
  additionalInfo?: string[]
  additionalInfoMk?: string[] // Macedonian additional info
  confidence: number // AI confidence score (0-1)
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
export type InngestEventName = FlyerParseEvent['name'] | ParseStatusUpdateEvent['name'] | ProductMatchEvent['name'] | ProductMatchStatusUpdateEvent['name']
