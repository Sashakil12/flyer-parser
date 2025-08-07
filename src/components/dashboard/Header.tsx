'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { signOutUser } from '@/lib/auth'
import { User } from '@/types'
import { toast } from 'react-hot-toast'
import { 
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  HomeIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline'

interface HeaderProps {
  user: User
}

export default function Header({ user }: HeaderProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  
  const showBackButton = pathname !== '/'
  
  const handleBack = () => {
    router.back()
  }

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true)
      await signOutUser()
      toast.success('Successfully signed out')
    } catch (error: any) {
      toast.error('Failed to sign out')
    } finally {
      setIsSigningOut(false)
      setIsDropdownOpen(false)
    }
  }

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Title */}
          <div className="flex items-center">
            {/* Back Button */}
            {showBackButton && (
              <button
                onClick={handleBack}
                className="mr-4 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
            )}
            
            <div className="flex-shrink-0">
              <Link href="/" className="text-2xl font-bold text-gray-900 hover:text-primary-600 transition-colors">
                Super Shop Flyer Parser
              </Link>
            </div>
            <div className="ml-4 flex items-center">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                AI-Powered
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-4">
            <Link 
              href="/"
              className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              <HomeIcon className="h-5 w-5 mr-2" />
              Dashboard
            </Link>
            <Link 
              href="/flyers"
              className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              View Flyers
            </Link>
          </div>

          {/* User Menu */}
          <div className="ml-4 flex items-center md:ml-6">
            <div className="relative">
              <button
                type="button"
                className="max-w-xs bg-white flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                <span className="sr-only">Open user menu</span>
                <div className="flex items-center space-x-3 px-4 py-2">
                  <UserCircleIcon className="h-8 w-8 text-gray-400" />
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium text-gray-900">
                      {user.email}
                    </span>
                    <span className="text-xs text-gray-500 capitalize">
                      {user.role}
                    </span>
                  </div>
                </div>
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                  <div className="px-4 py-2 text-sm text-gray-700 border-b border-gray-100">
                    <p className="font-medium">{user.email}</p>
                    <p className="text-gray-500 capitalize">{user.role} User</p>
                  </div>
                  
                  <button
                    className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    <Cog6ToothIcon className="mr-3 h-5 w-5 text-gray-400" />
                    Settings
                  </button>
                  
                  <button
                    className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                  >
                    <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5 text-gray-400" />
                    {isSigningOut ? 'Signing out...' : 'Sign out'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Overlay to close dropdown when clicking outside */}
      {isDropdownOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsDropdownOpen(false)}
        />
      )}
    </header>
  )
}
