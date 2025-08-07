'use client'

import { 
  PhotoIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  WifiIcon
} from '@heroicons/react/24/outline'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface StatsCardsProps {
  stats: {
    totalFlyers: number
    totalParsedItems: number
    pendingFlyers: number
    processingFlyers: number
    completedFlyers: number
    failedFlyers: number
    verifiedItems: number
    unverifiedItems: number
  }
  isLoading: boolean
}

export default function StatsCards({ stats, isLoading }: StatsCardsProps) {
  // Calculate derived statistics
  const successRate = stats.totalFlyers > 0 ? Math.round((stats.completedFlyers / stats.totalFlyers) * 100) : 0
  const verificationRate = stats.totalParsedItems > 0 ? Math.round((stats.verifiedItems / stats.totalParsedItems) * 100) : 0

  const statsCards = [
    {
      name: 'Total Images',
      value: stats.totalFlyers,
      change: undefined,
      changeType: 'neutral' as const,
      icon: PhotoIcon,
      color: 'blue'
    },
    {
      name: 'Parsed Items',
      value: stats.totalParsedItems,
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
      name: 'Verified Items',
      value: `${verificationRate}%`,
      change: undefined,
      changeType: 'neutral' as const,
      icon: WifiIcon,
      color: 'indigo'
    }
  ]

  const statusBreakdown = [
    { name: 'Completed', count: stats.completedFlyers, color: 'green' },
    { name: 'Processing', count: stats.processingFlyers, color: 'yellow' },
    { name: 'Pending', count: stats.pendingFlyers, color: 'blue' },
    { name: 'Failed', count: stats.failedFlyers, color: 'red' }
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
        {statsCards.map((item) => (
          <div key={item.name} className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative bg-white/80 backdrop-blur-sm rounded-xl border border-white/50 shadow-xl overflow-hidden">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center shadow-lg ${
                      item.color === 'blue' ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
                      item.color === 'green' ? 'bg-gradient-to-br from-green-500 to-green-600' :
                      item.color === 'yellow' ? 'bg-gradient-to-br from-yellow-500 to-yellow-600' :
                      item.color === 'red' ? 'bg-gradient-to-br from-red-500 to-red-600' :
                      item.color === 'indigo' ? 'bg-gradient-to-br from-indigo-500 to-indigo-600' :
                      'bg-gradient-to-br from-gray-500 to-gray-600'
                    }`}>
                      <item.icon className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-600 truncate">
                        {item.name}
                      </dt>
                      <dd className="mt-1">
                        <div className="text-2xl font-bold text-gray-900">
                          {item.value}
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
              <div className={`px-6 py-3 bg-gradient-to-r ${
                item.color === 'blue' ? 'from-blue-50/50 to-blue-100/50' :
                item.color === 'green' ? 'from-green-50/50 to-green-100/50' :
                item.color === 'yellow' ? 'from-yellow-50/50 to-yellow-100/50' :
                item.color === 'red' ? 'from-red-50/50 to-red-100/50' :
                item.color === 'indigo' ? 'from-indigo-50/50 to-indigo-100/50' :
                'from-gray-50/50 to-gray-100/50'
              } border-t border-white/50`}>
                <div className="text-sm">
                  <span className={`font-semibold ${
                    item.changeType === 'positive' ? 'text-green-700' :
                    item.changeType === 'negative' ? 'text-red-700' :
                    item.color === 'blue' ? 'text-blue-700' :
                    item.color === 'green' ? 'text-green-700' :
                    item.color === 'yellow' ? 'text-yellow-700' :
                    item.color === 'red' ? 'text-red-700' :
                    item.color === 'indigo' ? 'text-indigo-700' :
                    'text-gray-700'
                  }`}>
                    {item.color === 'green' && item.name === 'Success Rate' && successRate >= 90 && 'Excellent'}
                    {item.color === 'yellow' && item.name === 'Success Rate' && successRate >= 70 && 'Good'}
                    {item.color === 'red' && item.name === 'Success Rate' && successRate < 70 && 'Needs Improvement'}
                    {item.name !== 'Success Rate' && 'Live Data'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Status Breakdown */}
      {stats.totalFlyers > 0 && (
        <div className="mt-8 relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
          <div className="relative bg-white/80 backdrop-blur-sm rounded-xl border border-white/50 shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/50 bg-gradient-to-r from-slate-50/50 to-white/50">
              <h3 className="text-lg font-semibold text-gray-900">Processing Status</h3>
              <p className="mt-1 text-sm text-gray-600">
                Real-time status of all uploaded flyer images
              </p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
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
                        width: stats.totalFlyers > 0 ? `${(status.count / stats.totalFlyers) * 100}%` : '0%' 
                      }}
                    />
                  </div>
                </div>
              ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
