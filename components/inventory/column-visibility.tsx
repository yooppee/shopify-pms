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
import { Settings2 } from 'lucide-react'

interface ColumnVisibilityProps<TData> {
    columns: Column<TData, any>[]
    storageKey?: string
}

export function ColumnVisibility<TData>({
    columns,
    storageKey = 'inventory-column-visibility'
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
            <DropdownMenuContent align="end" className="w-56">
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
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
