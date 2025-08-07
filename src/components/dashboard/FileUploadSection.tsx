'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { User } from '@/types'
import { toast } from 'react-hot-toast'
import { CloudArrowUpIcon, PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { uploadFiles } from '@/lib/storage'

interface FileUploadSectionProps {
  onUploadComplete: () => void
  user: User
}

interface UploadFile extends File {
  preview?: string
}

export default function FileUploadSection({ onUploadComplete, user }: FileUploadSectionProps) {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Filter for image files only
    const imageFiles = acceptedFiles.filter(file => 
      file.type.startsWith('image/')
    )

    if (imageFiles.length < acceptedFiles.length) {
      toast.error('Only image files are allowed')
    }

    // Add preview URLs
    const filesWithPreview = imageFiles.map(file => 
      Object.assign(file, {
        preview: URL.createObjectURL(file)
      })
    )

    setFiles(prev => [...prev, ...filesWithPreview])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.gif']
    },
    maxFiles: 10,
    maxSize: 10 * 1024 * 1024, // 10MB per file
  })

  const removeFile = (index: number) => {
    setFiles(prev => {
      const newFiles = [...prev]
      if (newFiles[index]?.preview) {
        URL.revokeObjectURL(newFiles[index].preview!)
      }
      newFiles.splice(index, 1)
      return newFiles
    })
  }

  const clearAllFiles = () => {
    files.forEach(file => {
      if (file.preview) {
        URL.revokeObjectURL(file.preview)
      }
    })
    setFiles([])
    setUploadProgress({})
  }

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error('Please select files to upload')
      return
    }

    setIsUploading(true)
    setUploadProgress({})

    try {
      await uploadFiles(files, user.uid, (fileName, progress) => {
        setUploadProgress(prev => ({
          ...prev,
          [fileName]: progress
        }))
      })

      toast.success(`Successfully uploaded ${files.length} file(s)`)
      clearAllFiles()
      onUploadComplete()
    } catch (error: any) {
      toast.error('Upload failed: ' + error.message)
    } finally {
      setIsUploading(false)
      setUploadProgress({})
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900">Upload Flyer Images</h2>
          <p className="mt-1 text-sm text-gray-500">
            Upload store flyer images for AI-powered parsing. Supported formats: JPEG, PNG, WebP, GIF
          </p>
        </div>
        
        <div className="card-body">
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
              ${isDragActive 
                ? 'border-primary-500 bg-primary-50' 
                : 'border-gray-300 hover:border-gray-400'
              }
            `}
          >
            <input {...getInputProps()} />
            <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-900">
                {isDragActive
                  ? 'Drop the files here...'
                  : 'Drop files here, or click to select files'
                }
              </p>
              <p className="text-xs text-gray-500 mt-1">
                PNG, JPG, WebP up to 10MB each
              </p>
            </div>
          </div>

          {/* File Preview Grid */}
          {files.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-900">
                  Selected Files ({files.length})
                </h3>
                <button
                  type="button"
                  onClick={clearAllFiles}
                  className="text-sm text-red-600 hover:text-red-800"
                  disabled={isUploading}
                >
                  Clear All
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {files.map((file, index) => (
                  <div key={index} className="relative group">
                    <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                      <img
                        src={file.preview}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                      
                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        disabled={isUploading}
                        className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                      
                      {/* Progress Overlay */}
                      {isUploading && uploadProgress[file.name] !== undefined && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                          <div className="text-center text-white">
                            <div className="text-sm font-medium">
                              {Math.round(uploadProgress[file.name] || 0)}%
                            </div>
                            <div className="w-16 bg-gray-200 rounded-full h-1 mt-2">
                              <div
                                className="bg-primary-500 h-1 rounded-full transition-all duration-300"
                                style={{ width: `${uploadProgress[file.name] || 0}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-2 text-xs text-gray-500 truncate">
                      {file.name}
                    </div>
                    <div className="text-xs text-gray-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Button */}
          {files.length > 0 && (
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleUpload}
                disabled={isUploading || files.length === 0}
                className="btn-primary flex items-center space-x-2"
              >
                {isUploading ? (
                  <>
                    <LoadingSpinner size="small" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <PhotoIcon className="h-4 w-4" />
                    <span>Upload {files.length} File(s)</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Upload Tips */}
      <div className="card">
        <div className="card-body">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Upload Tips</h3>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Ensure flyer images are clear and well-lit</li>
            <li>• Higher resolution images produce better parsing results</li>
            <li>• Text should be clearly readable in the image</li>
            <li>• Processing typically takes 1-2 minutes per image</li>
            <li>• You'll be notified when parsing is complete</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
