'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { logout } from '@/app/login/actions'
import { LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Header() {
    const [userEmail, setUserEmail] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)

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
        await logout()
    }

    return (
        <header className="h-14 border-b bg-white flex items-center justify-between px-6">
            <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-slate-800">Shopify PMS</h1>
            </div>

            {isLoading ? (
                <div className="flex items-center gap-4">
                    <div className="animate-pulse bg-slate-100 h-4 w-32 rounded"></div>
                    <div className="animate-pulse bg-slate-100 h-8 w-20 rounded"></div>
                </div>
            ) : userEmail ? (
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                        <User className="h-4 w-4" />
                        <span>{userEmail}</span>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleLogout}
                        className="text-slate-600 hover:text-red-600 hover:bg-red-50"
                    >
                        <LogOut className="h-4 w-4 mr-1" />
                        登出
                    </Button>
                </div>
            ) : null}
        </header>
    )
}
