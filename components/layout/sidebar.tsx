'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    Package,
    FileText,
    BarChart3,
    Settings,
    PanelLeftClose,
    PanelLeftOpen
} from 'lucide-react'
import { useSidebar } from '@/components/providers/sidebar-provider'

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
    const { isOpen, toggle } = useSidebar()

    return (
        <div
            className={cn(
                "flex h-screen flex-col border-r bg-card transition-all duration-300 ease-in-out",
                isOpen ? "w-64" : "w-16"
            )}
        >
            {/* Logo */}
            <div className={cn(
                "flex h-16 items-center border-b",
                isOpen ? "px-6" : "justify-center px-0"
            )}>
                <Package className="h-6 w-6 text-primary shrink-0" />
                <span className={cn(
                    "ml-2 text-lg font-semibold overflow-hidden transition-all duration-300",
                    isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 hidden"
                )}>
                    Shopify PMS
                </span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 px-3 py-4">
                {navigation.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            title={!isOpen ? item.name : undefined}
                            className={cn(
                                'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                isActive
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                                isOpen ? 'gap-3' : 'justify-center'
                            )}
                        >
                            <item.icon className="h-5 w-5 shrink-0" />
                            <span className={cn(
                                "transition-all duration-300 overflow-hidden",
                                isOpen ? "opacity-100 w-auto" : "opacity-0 w-0 hidden"
                            )}>
                                {item.name}
                            </span>
                        </Link>
                    )
                })}
            </nav>

            {/* Footer / Toggle */}
            <div className="border-t p-4 flex flex-col gap-4">
                {isOpen && (
                    <div className="text-xs text-muted-foreground whitespace-nowrap overflow-hidden">
                        <div className="font-medium">Shopify PMS v1.0</div>
                        <div className="mt-1">Product Management System</div>
                    </div>
                )}

                <button
                    onClick={toggle}
                    className="flex w-full items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    title={isOpen ? "Collapse Sidebar" : "Expand Sidebar"}
                >
                    {isOpen ? (
                        <PanelLeftClose className="h-4 w-4" />
                    ) : (
                        <PanelLeftOpen className="h-4 w-4" />
                    )}
                </button>
            </div>
        </div>
    )
}
