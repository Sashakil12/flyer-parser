'use client'

import { ParsedFlyerItem } from '@/types'
import ProductMatchesPanel from '@/components/dashboard/ProductMatchesPanel'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'

interface ParsedItemCardProps {
  item: ParsedFlyerItem
}

export default function ParsedItemCard({ item }: ParsedItemCardProps) {
  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="bg-white shadow-lg rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-6 bg-gray-50 border-b border-gray-200">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{item.productName}</h2>
            {item.productNameMk && <p className="text-gray-600 mt-1">🇲🇰 {item.productNameMk}</p>}
            <p className="text-xs text-gray-500 mt-2">Created: {formatDate(item.createdAt)}</p>
          </div>
          <Link href={`/flyers/${item.flyerImageId}`} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
            View Source Flyer
          </Link>
        </div>
        <div className="mt-4 flex space-x-6 text-sm">
          <div>
            <p className="text-gray-500">Flyer Price</p>
            <p className="font-semibold text-red-600">{formatCurrency(item.discountPrice || 0, item.currency)}</p>
          </div>
          <div>
            <p className="text-gray-500">Original Price</p>
            <p className="font-semibold text-gray-700 line-through">{formatCurrency(item.oldPrice, item.currency)}</p>
          </div>
        </div>
      </div>
      <div className="p-6">
        <ProductMatchesPanel parsedItem={item} />
      </div>
    </div>
  )
}
