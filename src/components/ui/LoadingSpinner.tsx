import { clsx } from 'clsx'

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large'
  className?: string
}

const sizeClasses = {
  small: 'h-4 w-4',
  medium: 'h-8 w-8', 
  large: 'h-12 w-12'
}

export default function LoadingSpinner({ size = 'medium', className }: LoadingSpinnerProps) {
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <div className={clsx(
        'animate-spin rounded-full border-2 border-gray-300 border-t-primary-600',
        sizeClasses[size]
      )} />
    </div>
  )
}
