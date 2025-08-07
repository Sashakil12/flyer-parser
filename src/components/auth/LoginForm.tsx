'use client'

import { useState } from 'react'
import { signIn } from '@/lib/auth'
import { LoginFormData } from '@/types'
import { toast } from 'react-hot-toast'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function LoginForm() {
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await signIn(formData.email, formData.password)
      toast.success('Successfully signed in!')
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign in')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
      <div className="rounded-md shadow-sm -space-y-px">
        <div>
          <label htmlFor="email" className="sr-only">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={formData.email}
            onChange={handleChange}
            className="input-field rounded-t-md rounded-b-none"
            placeholder="Email address"
            disabled={isLoading}
          />
        </div>
        <div className="relative">
          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            required
            value={formData.password}
            onChange={handleChange}
            className="input-field rounded-b-md rounded-t-none pr-10"
            placeholder="Password"
            disabled={isLoading}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
            onClick={() => setShowPassword(!showPassword)}
            disabled={isLoading}
          >
            {showPassword ? (
              <EyeSlashIcon className="h-5 w-5 text-gray-400 hover:text-gray-500" />
            ) : (
              <EyeIcon className="h-5 w-5 text-gray-400 hover:text-gray-500" />
            )}
          </button>
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={isLoading || !formData.email || !formData.password}
          className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
        >
          {isLoading ? (
            <LoadingSpinner size="small" />
          ) : (
            'Sign in'
          )}
        </button>
      </div>

      <div className="text-center">
        <p className="text-sm text-gray-600">
          Admin access only - Contact system administrator for credentials
        </p>
      </div>
    </form>
  )
}
