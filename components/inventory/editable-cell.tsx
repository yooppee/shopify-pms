'use client'

import React, { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'

interface EditableCellProps {
    productId: string
    variantId: number
    field: string
    value: any
    format?: 'currency' | 'text' | 'number'
    tooltip?: string
    onUpdate: (variantId: number, field: string, value: any) => void
}

export function EditableCell({
    productId,
    variantId,
    field,
    value,
    format = 'text',
    tooltip = 'Click to edit',
    onUpdate
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
        onUpdate(variantId, field, parsedValue)
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
            return `$${Number(value).toFixed(2)}`
        }

        return value
    }

    if (isEditing) {
        return (
            <Input
                type="text"
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
            className="cell-editable h-8 px-2 py-1 font-mono text-xs text-foreground cursor-text hover:bg-muted/50 rounded transition-colors flex items-center"
            onClick={() => setIsEditing(true)}
            title={tooltip}
        >
            {getDisplayValue()}
        </div>
    )
}


