'use client'

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getExpandedRowModel,
    ColumnDef,
    flexRender,
    SortingState,
    ExpandedState,
    ColumnSizingState,
} from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Plus, Trash2, Upload, GitBranch, Save, X, ChevronRight, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { VariantDialog } from './variant-dialog'

// Listing draft interface
interface ListingDraft {
    id: string
    product_id: string | null
    original_data?: any
    draft_data: {
        title?: string
        price?: number
        compare_at_price?: number | null
        cost?: number | null
        weight?: number | null
        note?: string
        purchase_link?: string
        options?: any[]
        variants?: any[]
        is_pushed?: boolean
    }
    status: 'draft' | 'ready'
    created_at: string
    updated_at: string
}

// Unified Node type for Table (handles both SPU and Variants)
interface ListingNode {
    id: string
    is_variant: boolean
    parentId?: string
    title: string
    sku: string
    price: number
    compare_at_price: number | null
    cost: number | null
    weight: number | null
    vendor: string
    note: string
    purchase_link: string
    is_pushed?: boolean
    original: ListingDraft | any
    subRows?: ListingNode[]
}

// Pending change interface
interface PendingChange {
    id: string
    field: string
    value: any
}

interface ListingsDataTableProps {
    listings: ListingDraft[]
    onAddProduct: () => void
    onUpdateProduct: (id: string, updates: any) => void
    onDeleteProduct: (id: string) => void
    onDeleteVariant?: (variantId: string, parentId: string) => void
    onSyncSuccess?: () => void
    isLoading?: boolean
}

// Editable cell component
function EditableCell({
    value,
    format = 'text',
    onCommit,
}: {
    value: any
    format?: 'text' | 'currency' | 'number'
    onCommit: (value: any) => void
}) {
    const [isEditing, setIsEditing] = useState(false)
    const [editValue, setEditValue] = useState(value?.toString() || '')

    React.useEffect(() => {
        setEditValue(value?.toString() || '')
    }, [value])

    const handleBlur = () => {
        setIsEditing(false)
        const parsedValue = editValue === '' ? null :
            !isNaN(Number(editValue)) && format !== 'text' ? Number(editValue) : editValue

        if (parsedValue !== value) {
            onCommit(parsedValue)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur()
        } else if (e.key === 'Escape') {
            setEditValue(value?.toString() || '')
            setIsEditing(false)
        }
    }

    const getDisplayValue = () => {
        if (value == null || value === '') return '-'
        if (format === 'currency') return `$${Number(value).toFixed(2)}`
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
            className="h-auto min-h-8 px-2 py-1 font-mono text-xs text-foreground cursor-text hover:bg-muted/50 rounded transition-colors flex items-center"
            onClick={() => setIsEditing(true)}
            title="Click to edit"
        >
            {getDisplayValue()}
        </div>
    )
}

export function ListingsDataTable({
    listings,
    onAddProduct,
    onUpdateProduct,
    onDeleteProduct,
    onDeleteVariant,
    onSyncSuccess,
    isLoading = false,
}: ListingsDataTableProps) {
    const [sorting, setSorting] = useState<SortingState>([])
    const [expanded, setExpanded] = useState<ExpandedState>({})
    const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
    const [variantDialogOpen, setVariantDialogOpen] = useState(false)
    const [activeListingId, setActiveListingId] = useState<string | null>(null)
    const [isSyncing, setIsSyncing] = useState<string | null>(null)
    const tableContainerRef = useRef<HTMLDivElement>(null)

    // Column sizing with localStorage persistence
    const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('listings-column-sizing')
            if (saved) {
                try {
                    return JSON.parse(saved)
                } catch { }
            }
        }
        return {}
    })

    // Persist column sizing to localStorage
    const handleColumnSizingChange = useCallback((updater: any) => {
        setColumnSizing(prev => {
            const newSizing = typeof updater === 'function' ? updater(prev) : updater
            if (typeof window !== 'undefined') {
                localStorage.setItem('listings-column-sizing', JSON.stringify(newSizing))
            }
            return newSizing
        })
    }, [])

    // Transform Data for Table
    const data = useMemo(() => {
        return listings.map(listing => {
            const variants = listing.draft_data.variants || []
            const subRows = variants.map((v: any) => ({
                id: v.id, // Variant ID
                is_variant: true,
                parentId: listing.id,
                title: v.title,
                sku: v.sku || '',
                price: v.price,
                compare_at_price: v.compare_at_price,
                cost: v.cost,
                weight: v.weight,
                vendor: '', // Variants don't have vendor
                note: v.note || '',
                purchase_link: v.purchase_link || '',
                is_pushed: false,
                original: v,
            }))

            return {
                id: listing.id,
                is_variant: false,
                title: listing.draft_data.title || '',
                sku: listing.draft_data.sku || '',
                price: listing.draft_data.price || 0,
                compare_at_price: listing.draft_data.compare_at_price || null,
                cost: listing.draft_data.cost || null,
                weight: listing.draft_data.weight || null,
                vendor: listing.draft_data.vendor || '',
                note: listing.draft_data.note || '',
                purchase_link: listing.draft_data.purchase_link || '',
                is_pushed: listing.draft_data.is_pushed || false,
                original: listing,
                subRows: subRows.length > 0 ? subRows : undefined
            } as ListingNode
        })
    }, [listings])

    // Handle cell value change
    const handleCellChange = useCallback((id: string, field: string, value: any, isVariant: boolean, parentId?: string) => {
        // For variants, we need to track both their ID and their parent ID to construct the update later
        const changeId = isVariant ? `${parentId}|${id}` : id

        setPendingChanges(prev => {
            const filtered = prev.filter(p => !(p.id === changeId && p.field === field))
            return [...filtered, { id: changeId, field, value }]
        })
    }, [])

    // Get value with pending changes applied
    const getValueWithPending = useCallback((row: ListingNode, field: keyof ListingNode) => {
        const changeId = row.is_variant ? `${row.parentId}|${row.id}` : row.id
        const pending = pendingChanges.find(p => p.id === changeId && p.field === field)
        return pending !== undefined ? pending.value : row[field]
    }, [pendingChanges])

    // Save all pending changes
    // Save all pending changes
    const handleSaveChanges = useCallback(async () => {
        if (pendingChanges.length === 0) return

        const performSave = async () => {
            const updatesMatrix: Record<string, { spu: any; variants: Record<string, any> }> = {}

            pendingChanges.forEach(change => {
                const [rootId, variantId] = change.id.includes('|') ? change.id.split('|') : [change.id, null]
                if (!updatesMatrix[rootId]) updatesMatrix[rootId] = { spu: {}, variants: {} }

                if (variantId) {
                    if (!updatesMatrix[rootId].variants[variantId]) updatesMatrix[rootId].variants[variantId] = {}
                    updatesMatrix[rootId].variants[variantId][change.field] = change.value
                } else {
                    updatesMatrix[rootId].spu[change.field] = change.value
                }
            })

            // Iterate through root items to update
            for (const [id, changes] of Object.entries(updatesMatrix)) {
                const rootListing = listings.find(l => l.id === id)
                if (!rootListing) continue

                const newDraftData = { ...rootListing.draft_data, ...changes.spu }

                if (Object.keys(changes.variants).length > 0) {
                    newDraftData.variants = (rootListing.draft_data.variants || []).map((v: any) => {
                        const vUpdates = changes.variants[v.id]
                        return vUpdates ? { ...v, ...vUpdates } : v
                    })
                }

                // await here waits for DB update AND refetch due to mutateAsync + invalidatedQueries logic in page.tsx
                await onUpdateProduct(id, newDraftData)
            }
        }

        const promise = performSave()

        toast.promise(promise, {
            loading: 'Saving and updating table...',
            success: 'All changes saved and synced!',
            error: 'Save failed.'
        })

        try {
            await promise
            setPendingChanges([])
        } catch (e) {
            console.error('Save failed:', e)
        }
    }, [pendingChanges, onUpdateProduct, listings])


    const handleDiscardChanges = useCallback(() => {
        setPendingChanges([])
    }, [])

    // Open variant dialog
    const handleCreateVariant = useCallback((id: string) => {
        setActiveListingId(id)
        setVariantDialogOpen(true)
    }, [])

    // Save generated variants
    const handleSaveVariants = useCallback(async (options: any[], newVariants: any[]) => {
        if (!activeListingId) return

        const listing = listings.find(l => l.id === activeListingId)
        if (!listing) return

        const updatedDraftData = {
            ...listing.draft_data,
            options: options,
            variants: newVariants
        }

        await onUpdateProduct(activeListingId, updatedDraftData)
        setExpanded(prev => ({ ...prev, [activeListingId]: true }))
        toast.success(`Generated ${newVariants.length} variants!`)
    }, [activeListingId, listings, onUpdateProduct])

    const handleSyncToShopify = useCallback(async (id: string) => {
        setIsSyncing(id)
        const toastId = toast.loading('Pushing to Shopify...')
        try {
            const response = await fetch('/api/listings/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || 'Failed to sync')
            }

            toast.success('Product pushed to Shopify!', { id: toastId })
            if (onSyncSuccess) onSyncSuccess()
        } catch (error: any) {
            console.error('Sync error:', error)
            toast.error(`Sync failed: ${error.message}`, { id: toastId })
        } finally {
            setIsSyncing(null)
        }
    }, [onSyncSuccess])

    // Column definitions
    const columns: ColumnDef<ListingNode>[] = useMemo(() => [
        {
            accessorKey: 'is_pushed',
            header: 'If Pushed',
            size: 80,
            enableResizing: false,
            cell: ({ row }) => (
                <div className="flex justify-center">
                    <Checkbox
                        checked={row.original.is_pushed}
                        disabled={true}
                        aria-label="Is Pushed"
                    />
                </div>
            )
        },
        {
            accessorKey: 'title',
            header: 'Title',
            size: 250,
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    {row.getCanExpand() && (
                        <button
                            onClick={row.getToggleExpandedHandler()}
                            className="p-0.5 rounded-sm hover:bg-muted"
                        >
                            {row.getIsExpanded() ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronRight className="h-4 w-4" />
                            )}
                        </button>
                    )}
                    <span style={{ paddingLeft: row.depth * 20 + 'px' }}>
                        {row.original.is_variant ? (
                            <span className="text-sm px-2 py-1 text-muted-foreground">
                                {row.original.title}
                            </span>
                        ) : (
                            <EditableCell
                                value={getValueWithPending(row.original, 'title')}
                                format="text"
                                onCommit={(val) => handleCellChange(
                                    row.original.id,
                                    'title',
                                    val,
                                    row.original.is_variant,
                                    row.original.parentId
                                )}
                            />
                        )}
                    </span>
                </div>
            ),
        },
        {
            accessorKey: 'price',
            header: 'Price',
            size: 100,
            cell: ({ row }) => (
                <EditableCell
                    value={getValueWithPending(row.original, 'price')}
                    format="currency"
                    onCommit={(val) => handleCellChange(row.original.id, 'price', val, row.original.is_variant, row.original.parentId)}
                />
            ),
        },
        {
            accessorKey: 'compare_at_price',
            header: 'Compare At',
            size: 100,
            cell: ({ row }) => (
                <EditableCell
                    value={getValueWithPending(row.original, 'compare_at_price')}
                    format="currency"
                    onCommit={(val) => handleCellChange(row.original.id, 'compare_at_price', val, row.original.is_variant, row.original.parentId)}
                />
            ),
        },
        {
            accessorKey: 'cost',
            header: 'Cost',
            size: 100,
            cell: ({ row }) => (
                <EditableCell
                    value={getValueWithPending(row.original, 'cost')}
                    format="currency"
                    onCommit={(val) => handleCellChange(row.original.id, 'cost', val, row.original.is_variant, row.original.parentId)}
                />
            ),
        },
        {
            accessorKey: 'sku',
            header: 'SKU',
            size: 120,
            cell: ({ row }) => (
                <EditableCell
                    value={getValueWithPending(row.original, 'sku')}
                    format="text"
                    onCommit={(val) => handleCellChange(row.original.id, 'sku', val, row.original.is_variant, row.original.parentId)}
                />
            ),
        },
        {
            accessorKey: 'vendor',
            header: 'Vendor',
            size: 120,
            cell: ({ row }) => (
                row.original.is_variant ? (
                    <span className="text-muted-foreground">-</span>
                ) : (
                    <EditableCell
                        value={getValueWithPending(row.original, 'vendor')}
                        format="text"
                        onCommit={(val) => handleCellChange(row.original.id, 'vendor', val, row.original.is_variant, row.original.parentId)}
                    />
                )
            ),
        },
        {
            accessorKey: 'weight',
            header: 'Weight (g)',
            size: 100,
            cell: ({ row }) => (
                <EditableCell
                    value={getValueWithPending(row.original, 'weight')}
                    format="number"
                    onCommit={(val) => handleCellChange(row.original.id, 'weight', val, row.original.is_variant, row.original.parentId)}
                />
            ),
        },
        {
            accessorKey: 'note',
            header: 'Note',
            size: 150,
            cell: ({ row }) => (
                <EditableCell
                    value={getValueWithPending(row.original, 'note')}
                    format="text"
                    onCommit={(val) => handleCellChange(row.original.id, 'note', val, row.original.is_variant, row.original.parentId)}
                />
            ),
        },
        {
            accessorKey: 'purchase_link',
            header: 'Purchase Link',
            size: 150,
            cell: ({ row }) => (
                <EditableCell
                    value={getValueWithPending(row.original, 'purchase_link')}
                    format="text"
                    onCommit={(val) => handleCellChange(row.original.id, 'purchase_link', val, row.original.is_variant, row.original.parentId)}
                />
            ),
        },
        {
            id: 'actions',
            header: 'Actions',
            size: 120,
            enableResizing: false,
            cell: ({ row }) => (
                <div className="flex items-center gap-1">
                    {!row.original.is_variant ? (
                        <>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCreateVariant(row.original.id)}
                                title="Create Variant"
                            >
                                <GitBranch className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onDeleteProduct(row.original.id)}
                                title="Delete"
                                className="text-destructive hover:text-destructive"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSyncToShopify(row.original.id)}
                                title="Sync to Shopify"
                            >
                                <Upload className="h-4 w-4" />
                            </Button>
                        </>
                    ) : (
                        // Variant Actions
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDeleteVariant && onDeleteVariant(row.original.id, row.original.parentId!)}
                            title="Delete Variant"
                            className="text-destructive hover:text-destructive"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            ),
        },
    ], [getValueWithPending, handleCellChange, handleCreateVariant, onDeleteProduct, handleSyncToShopify])

    const table = useReactTable({
        data,
        columns,
        state: { sorting, expanded, columnSizing },
        onSortingChange: setSorting,
        onExpandedChange: setExpanded,
        onColumnSizingChange: handleColumnSizingChange,
        getSubRows: (row) => row.subRows,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getExpandedRowModel: getExpandedRowModel(),
        enableColumnResizing: true,
        columnResizeMode: 'onChange',
    })

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Button onClick={onAddProduct} disabled={isLoading}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Product
                    </Button>
                </div>
                {pendingChanges.length > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                            {pendingChanges.length} unsaved changes
                        </span>
                        <Button variant="outline" size="sm" onClick={handleDiscardChanges}>
                            <X className="mr-2 h-4 w-4" />
                            Discard
                        </Button>
                        <Button size="sm" onClick={handleSaveChanges}>
                            <Save className="mr-2 h-4 w-4" />
                            Save Changes
                        </Button>
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="rounded-md border" ref={tableContainerRef}>
                <Table className="w-full">
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead
                                        key={header.id}
                                        style={{
                                            width: header.getSize(),
                                            position: 'relative',
                                            userSelect: 'none'
                                        }}
                                        className="bg-muted/50"
                                    >
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                header.column.columnDef.header,
                                                header.getContext()
                                            )}
                                        {/* Resize Handle */}
                                        {header.column.getCanResize() && (
                                            <div
                                                onMouseDown={header.getResizeHandler()}
                                                onTouchStart={header.getResizeHandler()}
                                                className={`absolute right-0 top-0 h-full w-px cursor-col-resize select-none touch-none ${header.column.getIsResizing()
                                                        ? 'bg-primary'
                                                        : 'bg-border hover:bg-gray-400'
                                                    }`}
                                            />
                                        )}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id}>
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id} className="p-1">
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-24 text-center"
                                >
                                    {isLoading ? 'Loading...' : 'No products. Click "Add Product" to create one.'}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Variant Dialog */}
            <VariantDialog
                open={variantDialogOpen}
                onOpenChange={setVariantDialogOpen}
                initialOptions={activeListingId ? listings.find(l => l.id === activeListingId)?.draft_data.options : undefined}
                existingVariants={activeListingId ? listings.find(l => l.id === activeListingId)?.draft_data.variants : undefined}
                onSave={handleSaveVariants}
            />
        </div>
    )
}
