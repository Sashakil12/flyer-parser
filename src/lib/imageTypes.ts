/**
 * Comprehensive image format support configuration
 */

export interface ImageTypeConfig {
  mimeType: string
  extensions: string[]
  name: string
  description: string
}

// Comprehensive list of supported image formats
export const SUPPORTED_IMAGE_TYPES: ImageTypeConfig[] = [
  // Common raster formats
  {
    mimeType: 'image/jpeg',
    extensions: ['.jpg', '.jpeg'],
    name: 'JPEG',
    description: 'Joint Photographic Experts Group'
  },
  {
    mimeType: 'image/png',
    extensions: ['.png'],
    name: 'PNG',
    description: 'Portable Network Graphics'
  },
  {
    mimeType: 'image/webp',
    extensions: ['.webp'],
    name: 'WebP',
    description: 'Web Picture format'
  },
  {
    mimeType: 'image/gif',
    extensions: ['.gif'],
    name: 'GIF',
    description: 'Graphics Interchange Format'
  },
  {
    mimeType: 'image/bmp',
    extensions: ['.bmp'],
    name: 'BMP',
    description: 'Bitmap'
  },
  {
    mimeType: 'image/tiff',
    extensions: ['.tiff', '.tif'],
    name: 'TIFF',
    description: 'Tagged Image File Format'
  },
  {
    mimeType: 'image/ico',
    extensions: ['.ico'],
    name: 'ICO',
    description: 'Icon format'
  },
  
  // RAW formats (commonly used for high-quality photos)
  {
    mimeType: 'image/x-canon-cr2',
    extensions: ['.cr2'],
    name: 'Canon RAW',
    description: 'Canon RAW Format'
  },
  {
    mimeType: 'image/x-canon-crw',
    extensions: ['.crw'],
    name: 'Canon RAW',
    description: 'Canon RAW Format (older)'
  },
  {
    mimeType: 'image/x-nikon-nef',
    extensions: ['.nef'],
    name: 'Nikon RAW',
    description: 'Nikon Electronic Format'
  },
  {
    mimeType: 'image/x-sony-arw',
    extensions: ['.arw'],
    name: 'Sony RAW',
    description: 'Sony Alpha RAW'
  },
  {
    mimeType: 'image/x-adobe-dng',
    extensions: ['.dng'],
    name: 'Adobe DNG',
    description: 'Digital Negative'
  },
  
  // HEIC/HEIF (modern Apple formats)
  {
    mimeType: 'image/heic',
    extensions: ['.heic'],
    name: 'HEIC',
    description: 'High Efficiency Image Container'
  },
  {
    mimeType: 'image/heif',
    extensions: ['.heif'],
    name: 'HEIF',
    description: 'High Efficiency Image Format'
  },
  
  // AVIF (next-gen format)
  {
    mimeType: 'image/avif',
    extensions: ['.avif'],
    name: 'AVIF',
    description: 'AV1 Image File Format'
  },
  
  // JXL (JPEG XL - next-gen format)
  {
    mimeType: 'image/jxl',
    extensions: ['.jxl'],
    name: 'JPEG XL',
    description: 'JPEG XL'
  },
  
  // Additional formats
  {
    mimeType: 'image/x-ms-bmp',
    extensions: ['.bmp'],
    name: 'Windows BMP',
    description: 'Windows Bitmap'
  },
  {
    mimeType: 'image/svg+xml',
    extensions: ['.svg'],
    name: 'SVG',
    description: 'Scalable Vector Graphics'
  }
]

// Get all supported MIME types
export const getAllSupportedMimeTypes = (): string[] => {
  return SUPPORTED_IMAGE_TYPES.map(type => type.mimeType)
}

// Get all supported file extensions
export const getAllSupportedExtensions = (): string[] => {
  return SUPPORTED_IMAGE_TYPES.flatMap(type => type.extensions)
}

// Get accept attribute for file input (for react-dropzone)
export const getAcceptConfig = (): Record<string, string[]> => {
  const config: Record<string, string[]> = {}
  
  SUPPORTED_IMAGE_TYPES.forEach(type => {
    config[type.mimeType] = type.extensions
  })
  
  return config
}

// Get human-readable list of supported formats
export const getSupportedFormatsText = (): string => {
  const names = SUPPORTED_IMAGE_TYPES.map(type => type.name)
  return names.join(', ')
}

// Check if a file type is supported
export const isImageTypeSupported = (mimeType: string): boolean => {
  return getAllSupportedMimeTypes().includes(mimeType.toLowerCase())
}

// Get format info by MIME type
export const getImageTypeInfo = (mimeType: string): ImageTypeConfig | undefined => {
  return SUPPORTED_IMAGE_TYPES.find(type => type.mimeType === mimeType.toLowerCase())
}

// Get format info by file extension
export const getImageTypeInfoByExtension = (extension: string): ImageTypeConfig | undefined => {
  const ext = extension.toLowerCase()
  return SUPPORTED_IMAGE_TYPES.find(type => 
    type.extensions.some(supportedExt => supportedExt.toLowerCase() === ext)
  )
}

// Maximum file size (configurable)
export const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB (increased for RAW files)
export const MAX_FILES = undefined // No limit on number of files

// File validation function
export interface FileValidationResult {
  isValid: boolean
  error?: string
}

export const validateImageFile = (file: File): FileValidationResult => {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return { 
      isValid: false, 
      error: `File size must be less than ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB` 
    }
  }
  
  // Check file type
  if (!isImageTypeSupported(file.type)) {
    return { 
      isValid: false, 
      error: `Unsupported format. Supported formats: ${getSupportedFormatsText()}` 
    }
  }
  
  return { isValid: true }
}
