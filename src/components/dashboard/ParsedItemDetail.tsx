import React from 'react'
import { ParsedFlyerItem } from '@/types'
import ProductMatchesPanel from './ProductMatchesPanel'
import { formatCurrency } from '@/lib/utils'

interface ParsedItemDetailProps {
  item: ParsedFlyerItem
  onClose?: () => void
}

export default function ParsedItemDetail({ item, onClose }: ParsedItemDetailProps) {
  
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
    </div>
  )
}
