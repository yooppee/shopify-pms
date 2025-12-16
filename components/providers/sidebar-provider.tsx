'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

interface SidebarContextType {
    isOpen: boolean
    toggle: () => void
    close: () => void
    open: () => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(true)

    useEffect(() => {
        const stored = localStorage.getItem('sidebar-open')
        if (stored !== null) {
            setIsOpen(stored === 'true')
        }
    }, [])

    const toggle = useCallback(() => {
        setIsOpen(prev => {
            const newState = !prev
            // Defer localStorage write to not block the UI update
            queueMicrotask(() => {
                localStorage.setItem('sidebar-open', String(newState))
            })
            return newState
        })
    }, [])

    const close = useCallback(() => {
        setIsOpen(false)
        queueMicrotask(() => {
            localStorage.setItem('sidebar-open', 'false')
        })
    }, [])

    const open = useCallback(() => {
        setIsOpen(true)
        queueMicrotask(() => {
            localStorage.setItem('sidebar-open', 'true')
        })
    }, [])

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

