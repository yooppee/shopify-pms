'use client'

import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import React, { Suspense } from 'react'

function AppStatus() {
    const searchParams = useSearchParams()
    // Still support URL params for immediate feedback after redirect
    const urlSuccess = searchParams.get('success')
    const urlError = searchParams.get('error')

    // Internal state for async check
    const [status, setStatus] = React.useState<{
        loading: boolean
        authenticated: boolean
        shop?: string
        shopName?: string
        error?: string
    }>({
        loading: true,
        authenticated: false
    })

    React.useEffect(() => {
        // If we just got redirected with an error, show it immediately
        if (urlError) {
            setStatus({
                loading: false,
                authenticated: false,
                error: urlError
            })
            return
        }

        async function checkStatus() {
            try {
                const res = await fetch('/api/auth/status')
                const data = await res.json()
                setStatus({
                    loading: false,
                    authenticated: data.authenticated,
                    shop: data.shop,
                    shopName: data.shopName,
                    error: data.error
                })
            } catch (e) {
                setStatus({
                    loading: false,
                    authenticated: false,
                    error: 'Failed to reach backend API'
                })
            }
        }

        checkStatus()
    }, [urlError])

    // 1. Loading State
    if (status.loading) {
        return (
            <Card className="w-full max-w-md">
                <CardHeader className="text-center pb-6">
                    <div className="mx-auto mb-4 bg-gray-100 p-3 rounded-full w-fit animate-pulse">
                        <div className="w-8 h-8" />
                    </div>
                    <CardTitle className="text-xl">Checking Connection...</CardTitle>
                    <CardDescription>Verifying API permissions with Shopify</CardDescription>
                </CardHeader>
            </Card>
        )
    }

    // 2. Success State (From API or URL)
    if (status.authenticated || urlSuccess === 'true') {
        return (
            <Card className="w-full max-w-md border-green-200 bg-green-50/50">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto mb-4 bg-green-100 p-3 rounded-full w-fit">
                        <CheckCircle2 className="w-8 h-8 text-green-600" />
                    </div>
                    <CardTitle className="text-xl text-green-900">API Connected</CardTitle>
                    <CardDescription className="text-green-700">
                        {status.shopName ? `Connected to ${status.shopName}` : (status.shop ? `Connected to ${status.shop}` : 'Successfully authenticated')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                    <p className="text-sm text-center text-green-800">
                        We have verified read access to Orders and Products.
                    </p>
                    <div className="flex gap-3 justify-center">
                        <Link href="/inventory">
                            <Button className="bg-green-600 hover:bg-green-700">
                                Go to Inventory
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        )
    }

    // 3. Error / Not Installed State
    return (
        <Card className="w-full max-w-md border-red-200 bg-red-50/50">
            <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-4 bg-red-100 p-3 rounded-full w-fit">
                    <XCircle className="w-8 h-8 text-red-600" />
                </div>
                <CardTitle className="text-xl text-red-900">Connection Failed</CardTitle>
                <CardDescription className="text-red-700 font-mono text-xs">
                    {status.error || 'Unknown Error'}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
                <p className="text-sm text-center text-red-800">
                    The app cannot sync data because API permissions are missing or invalid.
                </p>
                {/* Optional Retry / Reinstall Form could go here if user wants to fix it */}
                <div className="pt-4 border-t border-red-200">
                    <p className="text-xs text-center text-muted-foreground mb-3">
                        Need to (re)install?
                    </p>
                    <form action="/api/auth" method="GET" className="space-y-2">
                        <input
                            className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                            name="shop"
                            placeholder="yooppe.myshopify.com"
                            required
                        />
                        <Button type="submit" variant="outline" className="w-full bg-white hover:bg-gray-100">
                            Re-install App
                        </Button>
                    </form>
                </div>
            </CardContent>
        </Card>
    )
}

export default function AppLandingPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <Suspense fallback={<div>Loading...</div>}>
                <AppStatus />
            </Suspense>
        </div>
    )
}
