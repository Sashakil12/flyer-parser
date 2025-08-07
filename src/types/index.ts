import { Timestamp } from 'firebase/firestore'

// Database Types
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
  discountPrice?: number
  discountPriceMk?: string // Macedonian discount price text
  oldPrice: number
  oldPriceMk?: string // Macedonian old price text
  currency: string // Currency code (e.g., 'USD', 'CAD', 'EUR', 'MKD')
  additionalInfo?: string[]
  additionalInfoMk?: string[] // Macedonian additional info
  confidence: number // AI confidence score (0-1)
  parsedAt: Timestamp
  verified: boolean
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
  discount_price?: number
  discount_price_mk?: string // Macedonian discount price text
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
export type InngestEventName = FlyerParseEvent['name'] | ParseStatusUpdateEvent['name']
