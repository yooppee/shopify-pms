'use client'

import React from 'react'
import { Column } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Settings2, WrapText, AlignLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ColumnVisibilityProps<TData> {
    columns: Column<TData, any>[]
    storageKey?: string
    textOverflowMode?: 'wrap' | 'truncate'
    onTextOverflowModeChange?: (mode: 'wrap' | 'truncate') => void
}

export function ColumnVisibility<TData>({
    columns,
    storageKey = 'inventory-column-visibility',
    textOverflowMode = 'wrap',
    onTextOverflowModeChange
}: ColumnVisibilityProps<TData>) {

    const toggleColumn = (columnId: string, visible: boolean) => {
        const column = columns.find(col => col.id === columnId)
        if (column) {
            column.toggleVisibility(visible)

            // Save to localStorage
            if (typeof window !== 'undefined') {
                const visibility: Record<string, boolean> = {}
                columns.forEach(col => {
                    if (col.id) {
                        visibility[col.id] = col.id === columnId ? visible : col.getIsVisible()
                    }
                })
                localStorage.setItem(storageKey, JSON.stringify(visibility))
            }
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto">
                    <Settings2 className="mr-2 h-4 w-4" />
                    Columns
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-[320px]">
                <div className="flex">
                    {/* Left Panel - Text Display Options */}
                    <div className="flex flex-col border-r min-w-[130px]">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Text Display</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <button
                            className={cn(
                                "flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors",
                                textOverflowMode === 'wrap' && "bg-accent font-medium"
                            )}
                            onClick={() => onTextOverflowModeChange?.('wrap')}
                        >
                            <WrapText className="h-4 w-4" />
                            <span>Wrap Text</span>
                            {textOverflowMode === 'wrap' && <span className="ml-auto text-primary">✓</span>}
                        </button>
                        <button
                            className={cn(
                                "flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors",
                                textOverflowMode === 'truncate' && "bg-accent font-medium"
                            )}
                            onClick={() => onTextOverflowModeChange?.('truncate')}
                        >
                            <AlignLeft className="h-4 w-4" />
                            <span>Truncate</span>
                            {textOverflowMode === 'truncate' && <span className="ml-auto text-primary">✓</span>}
                        </button>
                    </div>

                    {/* Right Panel - Toggle Columns */}
                    <div className="flex flex-col min-w-[180px] max-h-[300px] overflow-y-auto">
                        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {columns
                            .filter(column => column.getCanHide())
                            .map(column => {
                                const columnId = column.id || ''
                                const columnTitle = typeof column.columnDef.header === 'string'
                                    ? column.columnDef.header
                                    : columnId

                                return (
                                    <DropdownMenuCheckboxItem
                                        key={columnId}
                                        className="capitalize"
                                        checked={column.getIsVisible()}
                                        onCheckedChange={(value) => toggleColumn(columnId, value)}
                                    >
                                        {columnTitle}
                                    </DropdownMenuCheckboxItem>
                                )
                            })}
                    </div>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
