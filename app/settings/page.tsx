'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { logout } from '@/app/login/actions'
import { LogOut, User, Settings as SettingsIcon, Key, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export default function SettingsPage() {
    const [userEmail, setUserEmail] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isLoggingOut, setIsLoggingOut] = useState(false)

    useEffect(() => {
        const supabase = createClient()

        async function getUser() {
            const { data: { user } } = await supabase.auth.getUser()
            setUserEmail(user?.email || null)
            setIsLoading(false)
        }

        getUser()
    }, [])

    async function handleLogout() {
        setIsLoggingOut(true)
        await logout()
    }

    return (
        <div className="flex h-screen">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-auto bg-background">
                    <div className="container max-w-4xl py-8 px-6">
                        {/* Page Header */}
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2 bg-primary/10 rounded-lg">
                                <SettingsIcon className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold">Settings</h1>
                                <p className="text-muted-foreground">Manage your account and application settings</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {/* Account Section */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <User className="h-5 w-5" />
                                        Account
                                    </CardTitle>
                                    <CardDescription>
                                        Your account information and authentication settings
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* User Email */}
                                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                                        <div>
                                            <div className="text-sm font-medium text-muted-foreground">Email Address</div>
                                            <div className="text-base mt-1">
                                                {isLoading ? (
                                                    <div className="animate-pulse bg-muted h-5 w-48 rounded"></div>
                                                ) : (
                                                    userEmail || 'Not logged in'
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Logout Button */}
                                    <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900">
                                        <div>
                                            <div className="text-sm font-medium text-red-700 dark:text-red-400">Sign Out</div>
                                            <div className="text-sm text-red-600/70 dark:text-red-400/70 mt-1">
                                                Sign out of your account on this device
                                            </div>
                                        </div>
                                        <Button
                                            variant="destructive"
                                            onClick={handleLogout}
                                            disabled={isLoggingOut}
                                            className="shrink-0"
                                        >
                                            {isLoggingOut ? (
                                                <>
                                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                                                    Signing out...
                                                </>
                                            ) : (
                                                <>
                                                    <LogOut className="h-4 w-4 mr-2" />
                                                    Sign Out
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Shopify Integration Section */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Store className="h-5 w-5" />
                                        Shopify Integration
                                    </CardTitle>
                                    <CardDescription>
                                        Your Shopify store connection settings
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                                        <div>
                                            <div className="text-sm font-medium text-muted-foreground">Connection Status</div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                                                <span className="text-sm text-green-600 dark:text-green-400">Connected</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Key className="h-4 w-4" />
                                            <span>API Token configured</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* App Info Section */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>About</CardTitle>
                                    <CardDescription>
                                        Application information
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <div className="text-muted-foreground">Version</div>
                                            <div className="font-medium mt-1">1.0.0</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">Build</div>
                                            <div className="font-medium mt-1">Production</div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}

