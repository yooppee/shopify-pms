'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

interface SidebarContextType {
    isOpen: boolean
    toggle: () => void
    close: () => void
    open: () => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    // Initialize from localStorage if available, default to true (open)
    const [isOpen, setIsOpen] = useState(true)
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
        const stored = localStorage.getItem('sidebar-open')
        if (stored !== null) {
            setIsOpen(stored === 'true')
        }
    }, [])

    const toggle = () => {
        const newState = !isOpen
        setIsOpen(newState)
        localStorage.setItem('sidebar-open', String(newState))
    }

    const close = () => {
        setIsOpen(false)
        localStorage.setItem('sidebar-open', 'false')
    }

    const open = () => {
        setIsOpen(true)
        localStorage.setItem('sidebar-open', 'true')
    }

    // Prevent hydration mismatch by rendering nothing or a default state until mounted
    // However, for layout stability, we might render with default true and adjust
    // But to avoid flicker, we can check logic. 
    // For now, prompt update state is acceptable. 

    return (
        <SidebarContext.Provider value={{ isOpen, toggle, close, open }}>
            {children}
        </SidebarContext.Provider>
    )
}

export function useSidebar() {
    const context = useContext(SidebarContext)
    if (context === undefined) {
        throw new Error('useSidebar must be used within a SidebarProvider')
    }
    return context
}
