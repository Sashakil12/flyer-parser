'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import LoadingSpinner from './LoadingSpinner'

interface ClientOnlyProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

function ClientOnlyWrapper({ children, fallback }: ClientOnlyProps) {
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  if (!hasMounted) {
    return <>{fallback || <LoadingSpinner />}</>
  }

  return <>{children}</>
}

// Export as dynamic component with no SSR
const ClientOnly = dynamic(() => Promise.resolve(ClientOnlyWrapper), {
  ssr: false,
  loading: () => <LoadingSpinner />
})

export default ClientOnly
