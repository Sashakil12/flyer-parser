import { Timestamp } from 'firebase/firestore'

// Database Types
export interface FlyerImage {
  id: string
  filename: string
  uploadedAt: Timestamp
  fileSize: number
  fileType: string
  storageUrl: string
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed'
  uploadedBy: string
}

export interface ParsedFlyerItem {
  id: string
  flyerImageId: string // Reference to flyer-images
  productName: string
  discountPrice?: number
  oldPrice: number
  additionalInfo?: string[]
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
  discount_price?: number
  old_price: number
  additional_info?: string[]
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
