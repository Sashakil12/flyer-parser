'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { signOut } from '@/lib/auth'
import { User } from '@/types'
import { toast } from 'react-hot-toast'
import { 
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  HomeIcon,
  ArrowLeftIcon,
  DocumentTextIcon
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
      await signOut()
      toast.success('Successfully signed out')
      // Redirect to login page after successful logout
      router.push('/')
    } catch (error: any) {
      toast.error('Failed to sign out')
    } finally {
      setIsSigningOut(false)
      setIsDropdownOpen(false)
    }
  }

  return (
    <header className="sticky top-0 z-50 relative bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 shadow-xl border-b border-slate-700/50">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-purple-600/10"></div>
      <div className="absolute inset-0" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }}></div>
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Title */}
          <div className="flex items-center">
            {/* Back Button */}
            {showBackButton && (
              <button
                onClick={handleBack}
                className="mr-4 p-2.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg backdrop-blur-sm border border-white/10 transition-all duration-200 group"
              >
                <ArrowLeftIcon className="h-5 w-5 group-hover:scale-110 transition-transform" />
              </button>
            )}
            
            <div className="flex-shrink-0">
              <Link href="/" className="group">
                <div className="relative">
                  {/* Animated background glow */}
                  <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 rounded-2xl blur-sm opacity-30 group-hover:opacity-60 transition-all duration-300 animate-pulse"></div>
                  
                  {/* Main card */}
                  <div className="relative bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 px-4 py-3 shadow-xl group-hover:bg-white/15 group-hover:border-white/30 transition-all duration-300">
                    <div className="flex items-center space-x-4">
                      {/* Enhanced logo */}
                      <div className="relative">
                        <div className="h-12 w-12 bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-xl group-hover:shadow-2xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                          <svg className="h-7 w-7 text-white drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        {/* Floating dot indicator */}
                        <div className="absolute -top-1 -right-1 h-3 w-3 bg-green-400 rounded-full border-2 border-white shadow-sm animate-ping"></div>
                        <div className="absolute -top-1 -right-1 h-3 w-3 bg-green-400 rounded-full border-2 border-white shadow-sm"></div>
                      </div>
                      
                      {/* Enhanced text */}
                      <div className="flex flex-col">
                        <h1 className="text-xl font-bold bg-gradient-to-r from-white via-cyan-100 to-blue-100 bg-clip-text text-transparent group-hover:from-cyan-100 group-hover:via-white group-hover:to-blue-50 transition-all duration-300 drop-shadow-sm">
                          Flyer Parser
                        </h1>
                        <div className="flex items-center space-x-2 -mt-1">
                          <span className="text-xs text-cyan-200/80 font-medium">AI-Powered Analytics</span>
                          <div className="flex space-x-0.5">
                            <div className="h-1 w-1 bg-cyan-300 rounded-full animate-pulse"></div>
                            <div className="h-1 w-1 bg-blue-300 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                            <div className="h-1 w-1 bg-indigo-300 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-2">
            <Link 
              href="/"
              className="flex items-center px-4 py-2.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 rounded-lg backdrop-blur-sm border border-white/10 transition-all duration-200 group"
            >
              <HomeIcon className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" />
              Dashboard
            </Link>
            <Link 
              href="/flyers"
              className="flex items-center px-4 py-2.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 rounded-lg backdrop-blur-sm border border-white/10 transition-all duration-200 group"
            >
              <svg className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              View Flyers
            </Link>
            <Link 
              href="/parsed-items"
              className="flex items-center px-4 py-2.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 rounded-lg backdrop-blur-sm border border-white/10 transition-all duration-200 group"
            >
              <DocumentTextIcon className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" />
              Parsed Products
            </Link>
          </div>

          {/* User Menu */}
          <div className="ml-4 flex items-center md:ml-6">
            <div className="relative">
              <button
                type="button"
                className="flex items-center max-w-xs bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/20 hover:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all duration-200 group"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                <div className="flex items-center space-x-3">
                  {user.photoURL ? (
                    <img
                      className="h-8 w-8 rounded-full object-cover"
                      src={user.photoURL}
                      alt={user.displayName || user.email}
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                      <span className="text-sm font-medium text-indigo-600">
                        {(user.displayName || user.email).charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="hidden md:flex flex-col items-start">
                    <span className="text-sm font-medium text-white truncate max-w-[120px]">
                      {user.displayName || user.email.split('@')[0]}
                    </span>
                    <span className="text-xs text-white/60 capitalize">
                      {user.role}
                    </span>
                  </div>
                  <svg className="h-4 w-4 text-white/70 group-hover:text-white transition-colors" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-64 rounded-xl shadow-2xl bg-white/95 backdrop-blur-xl ring-1 ring-black/10 focus:outline-none z-50 border border-white/20">
                  {/* User Info Header */}
                  <div className="px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center space-x-3">
                      {user.photoURL ? (
                        <img
                          className="h-10 w-10 rounded-full object-cover"
                          src={user.photoURL}
                          alt={user.displayName || user.email}
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-indigo-600">
                            {(user.displayName || user.email).charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {user.displayName || user.email.split('@')[0]}
                        </p>
                        <p className="text-sm text-gray-500 truncate">{user.email}</p>
                        <p className="text-xs text-gray-400 capitalize">{user.role} User</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Menu Items */}
                  <div className="py-1">
                    <Link
                      href="/auto-approval"
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Cog6ToothIcon className="mr-3 h-4 w-4 text-gray-400" />
                      Settings
                    </Link>
                    <button
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleSignOut}
                      disabled={isSigningOut}
                    >
                      <ArrowRightOnRectangleIcon className="mr-3 h-4 w-4 text-gray-400" />
                      {isSigningOut ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Signing out...
                        </>
                      ) : (
                        'Sign out'
                      )}
                    </button>
                  </div>
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
