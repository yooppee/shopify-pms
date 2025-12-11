'use client'

import { useState } from 'react'
import { login } from './actions'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    async function handleSubmit(formData: FormData) {
        setIsLoading(true)
        setError(null)

        // Artificial delay for better UX
        await new Promise(resolve => setTimeout(resolve, 800))

        const result = await login(formData)

        if (result?.error) {
            setError(result.error)
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="w-full max-w-[400px] p-8 space-y-8 bg-white border border-gray-200 rounded-xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]">
                {/* Logo and Title */}
                <div className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 bg-black text-white rounded-lg flex items-center justify-center mb-6">
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                            />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                        Shopify PMS
                    </h1>
                    <p className="text-sm text-gray-500">
                        Sign in to manage your inventory
                    </p>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 text-red-600 px-4 py-3 rounded-md text-sm border border-red-100 flex items-center gap-2">
                        <div className="w-1 h-1 bg-red-600 rounded-full" />
                        {error}
                    </div>
                )}

                {/* Login Form */}
                <form action={handleSubmit} className="space-y-5">
                    <fieldset disabled={isLoading} className={`space-y-5 transition-opacity duration-200 ${isLoading ? 'opacity-50' : 'opacity-100'}`}>
                        <div className="space-y-1.5">
                            <label
                                htmlFor="email"
                                className="block text-sm font-medium text-gray-700"
                            >
                                Email address
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition-colors disabled:cursor-not-allowed text-sm"
                                placeholder="name@company.com"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label
                                htmlFor="password"
                                className="block text-sm font-medium text-gray-700"
                            >
                                Password
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition-colors disabled:cursor-not-allowed text-sm"
                                placeholder="••••••••"
                            />
                        </div>
                    </fieldset>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-2.5 px-4 bg-black text-white font-medium rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 transition-all disabled:opacity-80 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Verifying credentials...
                            </>
                        ) : (
                            'Sign in'
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div className="pt-4 border-t border-gray-100">
                    <p className="text-center text-xs text-gray-400">
                        Product Management System
                    </p>
                </div>
            </div>
        </div>
    )
}
