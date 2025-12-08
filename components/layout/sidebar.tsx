'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    Package,
    FileText,
    BarChart3,
    Settings
} from 'lucide-react'

const navigation = [
    {
        name: 'Inventory',
        href: '/inventory',
        icon: Package,
    },
    {
        name: 'Listings',
        href: '/listings',
        icon: FileText,
    },
    {
        name: 'Analytics',
        href: '/analytics',
        icon: BarChart3,
    },
    {
        name: 'Settings',
        href: '/settings',
        icon: Settings,
    },
]

export function Sidebar() {
    const pathname = usePathname()

    return (
        <div className="flex h-screen w-64 flex-col border-r bg-card">
            {/* Logo */}
            <div className="flex h-16 items-center border-b px-6">
                <Package className="h-6 w-6 text-primary" />
                <span className="ml-2 text-lg font-semibold">Shopify PMS</span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 px-3 py-4">
                {navigation.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                isActive
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                            )}
                        >
                            <item.icon className="h-5 w-5" />
                            {item.name}
                        </Link>
                    )
                })}
            </nav>

            {/* Footer */}
            <div className="border-t p-4">
                <div className="text-xs text-muted-foreground">
                    <div className="font-medium">Shopify PMS v1.0</div>
                    <div className="mt-1">Product Management System</div>
                </div>
            </div>
        </div>
    )
}
