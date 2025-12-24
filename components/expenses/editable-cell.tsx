"use client"

import React, { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'

interface EditableCellProps {
    value: any
    format?: 'currency' | 'text' | 'number'
    prefix?: string
    tooltip?: string
    onCommit: (value: any) => void
    className?: string
}

export function EditableCell({
    value,
    format = 'text',
    prefix = '',
    tooltip = 'Click to edit',
    onCommit,
    className
}: EditableCellProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [editValue, setEditValue] = useState(value?.toString() || '')

    // Sync editValue when value prop changes (e.g., after save or reset)
    useEffect(() => {
        setEditValue(value?.toString() || '')
    }, [value])

    const handleBlur = () => {
        setIsEditing(false)

        // Convert to number if it looks like a number
        const parsedValue = editValue === '' ? null :
            !isNaN(Number(editValue)) ? Number(editValue) : editValue

        // Only update if value changed - handle null/undefined comparison properly
        const originalValue = value ?? null
        if (parsedValue === originalValue) return

        // Update local state only - no database save
        onCommit(parsedValue)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur()
        } else if (e.key === 'Escape') {
            setEditValue(value?.toString() || '')
            setIsEditing(false)
        }
    }

    // Format display value
    const getDisplayValue = () => {
        if (value == null) return '-'

        if (format === 'currency') {
            return `${prefix}${Number(value).toFixed(2)}`
        }

        return `${prefix}${value}`
    }

    if (isEditing) {
        return (
            <Input
                type={format === 'number' || format === 'currency' ? 'number' : 'text'}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                autoFocus
                className="h-8 font-mono text-xs"
            />
        )
    }

    return (
        <div
            className={`cell-editable h-auto min-h-8 px-2 py-1 font-mono text-xs text-foreground cursor-text hover:bg-muted/50 rounded transition-colors flex items-center ${className || ''}`}
            onClick={() => setIsEditing(true)}
            title={tooltip}
        >
            {getDisplayValue()}
        </div>
    )
}
