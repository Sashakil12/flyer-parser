'use client'

import { FlyerImage, ParsedFlyerItem } from '@/types'
import { 
  PhotoIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface StatsCardsProps {
  flyerImages: FlyerImage[]
  parsedItems: ParsedFlyerItem[]
  isLoading: boolean
}

export default function StatsCards({ flyerImages, parsedItems, isLoading }: StatsCardsProps) {
  // Calculate statistics
  const totalImages = flyerImages.length
  const totalParsed = parsedItems.length
  const completed = flyerImages.filter(img => img.processingStatus === 'completed').length
  const processing = flyerImages.filter(img => img.processingStatus === 'processing').length
  const pending = flyerImages.filter(img => img.processingStatus === 'pending').length
  const failed = flyerImages.filter(img => img.processingStatus === 'failed').length
  const successRate = totalImages > 0 ? Math.round((completed / totalImages) * 100) : 0

  const stats = [
    {
      name: 'Total Images',
      value: totalImages,
      change: undefined,
      changeType: 'neutral' as const,
      icon: PhotoIcon,
      color: 'blue'
    },
    {
      name: 'Parsed Items',
      value: totalParsed,
      change: undefined,
      changeType: 'neutral' as const,
      icon: DocumentTextIcon,
      color: 'green'
    },
    {
      name: 'Success Rate',
      value: `${successRate}%`,
      change: undefined,
      changeType: successRate >= 90 ? 'positive' : successRate >= 70 ? 'neutral' : 'negative' as const,
      icon: CheckCircleIcon,
      color: successRate >= 90 ? 'green' : successRate >= 70 ? 'yellow' : 'red'
    },
    {
      name: 'Processing',
      value: processing,
      change: undefined,
      changeType: 'neutral' as const,
      icon: ClockIcon,
      color: 'yellow'
    }
  ]

  const statusBreakdown = [
    { name: 'Completed', count: completed, color: 'green' },
    { name: 'Processing', count: processing, color: 'yellow' },
    { name: 'Pending', count: pending, color: 'blue' },
    { name: 'Failed', count: failed, color: 'red' }
  ]

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card card-body">
            <LoadingSpinner size="medium" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => (
          <div key={item.name} className="card overflow-hidden">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <item.icon 
                    className={`h-6 w-6 ${
                      item.color === 'blue' ? 'text-blue-600' :
                      item.color === 'green' ? 'text-green-600' :
                      item.color === 'yellow' ? 'text-yellow-600' :
                      item.color === 'red' ? 'text-red-600' :
                      'text-gray-600'
                    }`} 
                  />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {item.name}
                    </dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">
                        {item.value}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className={`px-5 py-3 ${
              item.color === 'blue' ? 'bg-blue-50' :
              item.color === 'green' ? 'bg-green-50' :
              item.color === 'yellow' ? 'bg-yellow-50' :
              item.color === 'red' ? 'bg-red-50' :
              'bg-gray-50'
            }`}>
              <div className="text-sm">
                <span className={`font-medium ${
                  item.changeType === 'positive' ? 'text-green-600' :
                  item.changeType === 'negative' ? 'text-red-600' :
                  'text-gray-600'
                }`}>
                  {item.color === 'green' && item.name === 'Success Rate' && successRate >= 90 && 'Excellent'}
                  {item.color === 'yellow' && item.name === 'Success Rate' && successRate >= 70 && 'Good'}
                  {item.color === 'red' && item.name === 'Success Rate' && successRate < 70 && 'Needs Improvement'}
                  {item.name !== 'Success Rate' && 'Active'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Status Breakdown */}
      {totalImages > 0 && (
        <div className="mt-6 card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">Processing Status</h3>
            <p className="mt-1 text-sm text-gray-500">
              Current status of all uploaded flyer images
            </p>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {statusBreakdown.map((status) => (
                <div key={status.name} className="text-center">
                  <div className={`text-2xl font-bold ${
                    status.color === 'green' ? 'text-green-600' :
                    status.color === 'yellow' ? 'text-yellow-600' :
                    status.color === 'blue' ? 'text-blue-600' :
                    status.color === 'red' ? 'text-red-600' :
                    'text-gray-600'
                  }`}>
                    {status.count}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {status.name}
                  </div>
                  <div className={`mt-2 w-full bg-gray-200 rounded-full h-2`}>
                    <div 
                      className={`h-2 rounded-full ${
                        status.color === 'green' ? 'bg-green-500' :
                        status.color === 'yellow' ? 'bg-yellow-500' :
                        status.color === 'blue' ? 'bg-blue-500' :
                        status.color === 'red' ? 'bg-red-500' :
                        'bg-gray-500'
                      }`}
                      style={{ 
                        width: totalImages > 0 ? `${(status.count / totalImages) * 100}%` : '0%' 
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
