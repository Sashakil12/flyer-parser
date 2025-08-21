'use client'

import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { TagIcon, CheckIcon, PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { 
  getAutoApprovalRules, 
  saveAutoApprovalRule, 
  deleteAutoApprovalRule 
} from '@/lib/firestore'
import { AutoApprovalRule } from '@/types'

// Field tags for the prompt editor
const FIELD_TAGS = [
  { key: 'name', label: 'name', color: 'bg-blue-100 text-blue-800' },
  { key: 'macedonianname', label: 'macedonianname', color: 'bg-green-100 text-green-800' },
  { key: 'albenianname', label: 'albenianname', color: 'bg-purple-100 text-purple-800' },
  { key: 'description', label: 'description', color: 'bg-yellow-100 text-yellow-800' },
  { key: 'category', label: 'category', color: 'bg-indigo-100 text-indigo-800' },
  { key: 'superMarketName', label: 'superMarketName', color: 'bg-red-100 text-red-800' },
  { key: 'keywords', label: 'keywords', color: 'bg-orange-100 text-orange-800' },
  { key: 'tags', label: 'tags', color: 'bg-teal-100 text-teal-800' },
  { key: 'englishNameKeywords', label: 'englishNameKeywords', color: 'bg-cyan-100 text-cyan-800' },
  { key: 'macedoniannameKeywords', label: 'macedoniannameKeywords', color: 'bg-lime-100 text-lime-800' },
  { key: 'albeniannameKeywords', label: 'albeniannameKeywords', color: 'bg-pink-100 text-pink-800' }
]

export default function AutoApprovalPage() {
  const [rules, setRules] = useState<AutoApprovalRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingRule, setEditingRule] = useState<AutoApprovalRule | null>(null)
  
  // Form state
  const [ruleName, setRuleName] = useState('')
  const [promptText, setPromptText] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)

  useEffect(() => {
    loadRules()
  }, [])

  const loadRules = async () => {
    try {
      setIsLoading(true)
      const rulesData = await getAutoApprovalRules()
      setRules(rulesData)
    } catch (error) {
      console.error('Error loading auto-approval rules:', error)
      toast.error('Failed to load auto-approval rules')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setRuleName('')
    setPromptText('')
    setEditingRule(null)
    setShowForm(false)
  }

  const handleEditRule = (rule: AutoApprovalRule) => {
    setEditingRule(rule)
    setRuleName(rule.name)
    setPromptText(rule.prompt)
    setShowForm(true)
  }

  const insertFieldTag = (fieldKey: string) => {
    const tag = `{${fieldKey}}`
    const newText = promptText.slice(0, cursorPosition) + tag + promptText.slice(cursorPosition)
    setPromptText(newText)
    setCursorPosition(cursorPosition + tag.length)
  }

  const handleSaveRule = async () => {
    if (!ruleName.trim()) {
      toast.error('Rule name is required')
      return
    }

    if (!promptText.trim()) {
      toast.error('Prompt text is required')
      return
    }

    try {
      const ruleData = {
        name: ruleName.trim(),
        prompt: promptText.trim(),
        isActive: true
      }

      if (editingRule) {
        await saveAutoApprovalRule(editingRule.id, ruleData)
        toast.success('Auto-approval rule updated successfully')
      } else {
        await saveAutoApprovalRule(null, ruleData)
        toast.success('Auto-approval rule created successfully')
      }

      resetForm()
      loadRules()
    } catch (error) {
      console.error('Error saving rule:', error)
      toast.error('Failed to save auto-approval rule')
    }
  }

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this auto-approval rule?')) {
      return
    }

    try {
      await deleteAutoApprovalRule(ruleId)
      toast.success('Auto-approval rule deleted successfully')
      loadRules()
    } catch (error) {
      console.error('Error deleting rule:', error)
      toast.error('Failed to delete auto-approval rule')
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPromptText(e.target.value)
    setCursorPosition(e.target.selectionStart)
  }

  const handleTextareaClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement
    setCursorPosition(target.selectionStart)
  }

  const handleTextareaKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement
    setCursorPosition(target.selectionStart)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading auto-approval rules...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Auto-Approval Configuration</h1>
              <p className="mt-2 text-gray-600">
                Set up rules for automatically approving product matches based on field similarity
              </p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              New Rule
            </button>
          </div>
        </div>

        {/* Rules List */}
        {!showForm && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Auto-Approval Rules</h2>
            </div>
            
            {rules.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No auto-approval rules configured yet.</p>
                <button
                  onClick={() => setShowForm(true)}
                  className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  <PlusIcon className="h-5 w-5 mr-2" />
                  Create First Rule
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {rules.map((rule) => (
                  <div key={rule.id} className="px-6 py-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <h3 className="text-lg font-medium text-gray-900">{rule.name}</h3>
                          <span className={`ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            rule.isActive 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {rule.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600 line-clamp-3">{rule.prompt}</p>
                        <div className="mt-2 text-xs text-gray-500">
                          Created: {rule.createdAt.toDate().toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => handleEditRule(rule)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full"
                          title="Edit rule"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full"
                          title="Delete rule"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Prompt Editor Form */}
        {showForm && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-medium text-gray-900">
                  {editingRule ? 'Edit Auto-Approval Prompt' : 'Create Auto-Approval Prompt'}
                </h2>
                <button
                  onClick={resetForm}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Rule Name */}
              <div>
                <label htmlFor="ruleName" className="block text-sm font-medium text-gray-700">
                  Rule Name
                </label>
                <input
                  type="text"
                  id="ruleName"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="input-field mt-1"
                  placeholder="e.g., Exact Name Match Rule"
                />
              </div>

              {/* Field Tags */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Available Field Tags</h3>
                <p className="text-xs text-gray-500 mb-4">
                  Click on any field tag to insert it into your prompt at the cursor position
                </p>
                <div className="flex flex-wrap gap-2">
                  {FIELD_TAGS.map((field) => (
                    <button
                      key={field.key}
                      onClick={() => insertFieldTag(field.label)}
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${field.color}`}
                    >
                      <TagIcon className="h-3 w-3 mr-1" />
                      {field.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt Editor */}
              <div>
                <label htmlFor="promptText" className="block text-sm font-medium text-gray-700 mb-2">
                  Auto-Approval Prompt
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Write your auto-approval logic using field tags. Example: "Auto merge when &#123;name&#125; is 100% match and &#123;albenianname&#125; is 90% match"
                </p>
                <textarea
                  id="promptText"
                  rows={8}
                  value={promptText}
                  onChange={handleTextareaChange}
                  onClick={handleTextareaClick}
                  onKeyUp={handleTextareaKeyUp}
                  className="input-field font-mono"
                  placeholder="Auto update products when the &#123;name&#125; field is 100% match, &#123;albenianname&#125; and &#123;description&#125; field is 90% match. Ignore all other fields."
                />
              </div>

              {/* Example Prompts */}
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">Example Prompts:</h4>
                <div className="space-y-2 text-xs text-blue-800">
                  <div className="font-mono bg-white p-2 rounded border">
                    Auto merge when &#123;name&#125; is 100% match and &#123;description&#125; is 90% match
                  </div>
                  <div className="font-mono bg-white p-2 rounded border">
                    Approve if &#123;name&#125; and &#123;macedonianname&#125; are exact matches, ignore &#123;keywords&#125;
                  </div>
                  <div className="font-mono bg-white p-2 rounded border">
                    Auto approve when &#123;name&#125; is perfect match OR (&#123;albenianname&#125; + &#123;category&#125;) are 95% match
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRule}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <CheckIcon className="h-4 w-4 mr-2" />
                  {editingRule ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
