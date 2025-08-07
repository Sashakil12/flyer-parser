'use client'

import { useState, useEffect } from 'react'
import { ParsedFlyerItem } from '@/types'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { getSupportedCurrencies, getCurrencySymbol } from '@/lib/currency'

interface EditProductModalProps {
  isOpen: boolean
  onClose: () => void
  item: ParsedFlyerItem | null
  onSave: (id: string, updates: Partial<ParsedFlyerItem>) => Promise<void>
  isLoading?: boolean
}

export default function EditProductModal({ 
  isOpen, 
  onClose, 
  item, 
  onSave, 
  isLoading = false 
}: EditProductModalProps) {
  const [formData, setFormData] = useState({
    productName: '',
    productNameMk: '',
    discountPrice: '',
    discountPriceMk: '',
    oldPrice: '',
    oldPriceMk: '',
    currency: 'USD',
    additionalInfo: '',
    additionalInfoMk: ''
  })

  // Update form data when item changes
  useEffect(() => {
    if (item && isOpen) {
      setFormData({
        productName: item.productName || '',
        productNameMk: item.productNameMk || '',
        discountPrice: item.discountPrice?.toString() || '',
        discountPriceMk: item.discountPriceMk || '',
        oldPrice: item.oldPrice?.toString() || '',
        oldPriceMk: item.oldPriceMk || '',
        currency: item.currency || 'USD',
        additionalInfo: item.additionalInfo?.join(', ') || '',
        additionalInfoMk: item.additionalInfoMk?.join(', ') || ''
      })
    } else if (!isOpen) {
      // Reset form when modal closes
      setFormData({
        productName: '',
        productNameMk: '',
        discountPrice: '',
        discountPriceMk: '',
        oldPrice: '',
        oldPriceMk: '',
        currency: 'USD',
        additionalInfo: '',
        additionalInfoMk: ''
      })
    }
  }, [item, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!item) return

    try {
      const updatedItem: Partial<ParsedFlyerItem> = {
        productName: formData.productName,
        productNameMk: formData.productNameMk || undefined,
        discountPrice: formData.discountPrice ? parseFloat(formData.discountPrice.toString()) : undefined,
        discountPriceMk: formData.discountPriceMk || undefined,
        oldPrice: parseFloat(formData.oldPrice.toString()),
        oldPriceMk: formData.oldPriceMk || undefined,
        currency: formData.currency,
        additionalInfo: formData.additionalInfo ? formData.additionalInfo.split(',').map(s => s.trim()).filter(Boolean) : [],
        additionalInfoMk: formData.additionalInfoMk ? formData.additionalInfoMk.split(',').map(s => s.trim()).filter(Boolean) : []
      }

      await onSave(item.id, updatedItem)
      onClose()
    } catch (error) {
      console.error('Error saving product:', error)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  if (!isOpen || !item) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              Edit Product
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Product Name */}
            <div>
              <label htmlFor="productName" className="block text-sm font-medium text-gray-700 mb-1">
                Product Name *
              </label>
              <input
                type="text"
                id="productName"
                value={formData.productName}
                onChange={(e) => handleInputChange('productName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>

            {/* Macedonian Product Name */}
            <div>
              <label htmlFor="productNameMk" className="block text-sm font-medium text-gray-700 mb-1">
                🇲🇰 Macedonian Product Name
              </label>
              <input
                type="text"
                id="productNameMk"
                value={formData.productNameMk}
                onChange={(e) => handleInputChange('productNameMk', e.target.value)}
                placeholder="Македонско име на производот"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Old Price */}
            <div>
              <label htmlFor="oldPrice" className="block text-sm font-medium text-gray-700 mb-1">
                Original Price *
              </label>
              <input
                type="number"
                id="oldPrice"
                step="0.01"
                value={formData.oldPrice}
                onChange={(e) => handleInputChange('oldPrice', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>

            {/* Discount Price */}
            <div>
              <label htmlFor="discountPrice" className="block text-sm font-medium text-gray-700 mb-1">
                Discount Price
              </label>
              <input
                type="number"
                id="discountPrice"
                step="0.01"
                value={formData.discountPrice}
                onChange={(e) => handleInputChange('discountPrice', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Leave empty if no discount"
              />
            </div>

            {/* Macedonian Price Fields */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h4 className="text-sm font-medium text-blue-900 mb-3 flex items-center">
                🇲🇰 Macedonian Price Information
              </h4>
              
              {/* Macedonian Old Price */}
              <div className="mb-3">
                <label htmlFor="oldPriceMk" className="block text-sm font-medium text-gray-700 mb-1">
                  Original Price (Macedonian Text)
                </label>
                <input
                  type="text"
                  id="oldPriceMk"
                  value={formData.oldPriceMk}
                  onChange={(e) => handleInputChange('oldPriceMk', e.target.value)}
                  placeholder="напр. 299,99 ден"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Macedonian Discount Price */}
              <div>
                <label htmlFor="discountPriceMk" className="block text-sm font-medium text-gray-700 mb-1">
                  Discount Price (Macedonian Text)
                </label>
                <input
                  type="text"
                  id="discountPriceMk"
                  value={formData.discountPriceMk}
                  onChange={(e) => handleInputChange('discountPriceMk', e.target.value)}
                  placeholder="напр. 199,99 ден"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Currency */}
            <div>
              <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
                Currency *
              </label>
              <select
                id="currency"
                value={formData.currency}
                onChange={(e) => handleInputChange('currency', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              >
                {getSupportedCurrencies().map(currencyCode => (
                  <option key={currencyCode} value={currencyCode}>
                    {getCurrencySymbol(currencyCode)} - {currencyCode}
                  </option>
                ))}
              </select>
            </div>

            {/* Additional Info */}
            <div>
              <label htmlFor="additionalInfo" className="block text-sm font-medium text-gray-700 mb-1">
                Additional Info
              </label>
              <input
                type="text"
                id="additionalInfo"
                value={formData.additionalInfo}
                onChange={(e) => handleInputChange('additionalInfo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Separate multiple items with commas"
              />
              <p className="text-xs text-gray-500 mt-1">
                Examples: Limited time, While supplies last, Buy 2 get 1 free
              </p>
            </div>

            {/* Macedonian Additional Info */}
            <div>
              <label htmlFor="additionalInfoMk" className="block text-sm font-medium text-gray-700 mb-1">
                🇲🇰 Macedonian Additional Info
              </label>
              <input
                type="text"
                id="additionalInfoMk"
                value={formData.additionalInfoMk}
                onChange={(e) => handleInputChange('additionalInfoMk', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Одделете повеќе ставки со запирки"
              />
              <p className="text-xs text-gray-500 mt-1">
                Примери: Ограничено време, Додека има залихи, Купи 2 добиј 1 бесплатно
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 transition-colors"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading}
              >
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
