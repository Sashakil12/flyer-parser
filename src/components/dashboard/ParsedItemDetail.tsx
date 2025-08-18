import React from 'react'
import { ParsedFlyerItem } from '@/types'
import ProductMatchesPanel from './ProductMatchesPanel'
import { formatCurrency } from '@/lib/utils'

interface ParsedItemDetailProps {
  item: ParsedFlyerItem
  onClose?: () => void
  onApplyDiscount?: (parsedItemId: string, productId: string, discountPercentage: number) => Promise<void>
}

export default function ParsedItemDetail({ item, onClose, onApplyDiscount }: ParsedItemDetailProps) {
  const [discountPercentage, setDiscountPercentage] = React.useState<number>(
    // Calculate default discount percentage if both prices are available
    item.discountPrice && item.oldPrice 
      ? Math.round(((item.oldPrice - item.discountPrice) / item.oldPrice) * 100)
      : 10
  )
  const [isApplying, setIsApplying] = React.useState(false)
  
  const handleApplyDiscount = async () => {
    if (!item.selectedProductId) return
    
    try {
      setIsApplying(true)
      
      if (onApplyDiscount) {
        await onApplyDiscount(item.id, item.selectedProductId, discountPercentage)
      }
    } catch (error) {
      console.error('Error applying discount:', error)
    } finally {
      setIsApplying(false)
    }
  }
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">{item.productName}</h2>
      
      {item.productNameMk && (
        <p className="text-gray-600 mb-4">{item.productNameMk}</p>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <h3 className="text-sm font-medium text-gray-500">Price Information</h3>
          <div className="mt-2 space-y-2">
            <div className="flex justify-between">
              <span>Old Price:</span>
              <span className="font-medium">{formatCurrency(item.oldPrice, item.currency)}</span>
            </div>
            {item.discountPrice && (
              <div className="flex justify-between">
                <span>Discount Price:</span>
                <span className="font-medium text-red-600">{formatCurrency(item.discountPrice, item.currency)}</span>
              </div>
            )}
            {item.discountStartDate && (
              <div className="flex justify-between">
                <span>Valid From:</span>
                <span>{new Date(item.discountStartDate).toLocaleDateString()}</span>
              </div>
            )}
            {item.discountEndDate && (
              <div className="flex justify-between">
                <span>Valid Until:</span>
                <span>{new Date(item.discountEndDate).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
        
        <div>
          <h3 className="text-sm font-medium text-gray-500">Additional Information</h3>
          <div className="mt-2">
            {item.additionalInfo && item.additionalInfo.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1">
                {item.additionalInfo.map((info, index) => (
                  <li key={index}>{info}</li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400">No additional information</p>
            )}
          </div>
        </div>
      </div>
      
      <ProductMatchesPanel 
        parsedItem={item}
      />
      
      {item.selectedProductId && (
        <div className="mt-4 border rounded-md p-4 bg-blue-50">
          <h3 className="font-medium mb-3">Apply Discount</h3>
          <div className="flex items-center space-x-4">
            <div>
              <label htmlFor="discount" className="block text-sm font-medium text-gray-700">
                Discount Percentage
              </label>
              <input
                type="number"
                id="discount"
                min="1"
                max="99"
                value={discountPercentage}
                onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                className="mt-1 block w-24 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
            
            <button
              onClick={handleApplyDiscount}
              disabled={isApplying || !item.selectedProductId}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isApplying ? 'Applying...' : 'Apply Discount'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
