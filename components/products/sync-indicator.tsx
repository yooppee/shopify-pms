'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { AlertCircle } from 'lucide-react'

interface SyncIndicatorProps {
    field: string
    dbValue: number | null
    liveValue: number | null
}

export function SyncIndicator({ field, dbValue, liveValue }: SyncIndicatorProps) {
    const hasChanges = dbValue !== liveValue

    if (!hasChanges) {
        return <span className="font-mono">{dbValue ?? '-'}</span>
    }

    return (
        <div className="flex items-center gap-2">
            <span className="font-mono">{dbValue ?? '-'}</span>
            <Badge variant="warning" className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Live: {liveValue ?? '-'}
            </Badge>
        </div>
    )
}

interface DiffCellProps {
    dbValue: number | null
    liveValue?: number | null
    hasChanges?: boolean
}

export function DiffCell({ dbValue, liveValue, hasChanges }: DiffCellProps) {
    if (!hasChanges || liveValue === undefined) {
        return <span className="font-mono">{dbValue ?? '-'}</span>
    }

    return (
        <div
            className="cell-changed px-2 py-1 rounded"
            title={`DB: ${dbValue ?? 'null'} | Live: ${liveValue ?? 'null'}`}
        >
            <div className="flex items-center gap-2">
                <span className="font-mono font-semibold">{dbValue ?? '-'}</span>
                <span className="text-xs text-muted-foreground">→</span>
                <span className="font-mono text-amber-700 dark:text-amber-400">
                    {liveValue ?? '-'}
                </span>
            </div>
        </div>
    )
}
