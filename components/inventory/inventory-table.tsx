'use client'

import React, { useMemo, useState } from 'react'
import {
    useReactTable,
    getCoreRowModel,
    getExpandedRowModel,
    ColumnDef,
    flexRender,
    ExpandedState,
} from '@tanstack/react-table'
import { ProductWithCalculations } from '@/lib/supabase/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    ChevronRight,
    ChevronDown,
    Boxes,
    TrendingUp,
    TrendingDown,
    Save,
    RotateCcw,
    Trash2,
    X,
    Check,
    Calendar,
    Clock,
    GitBranch,
    Edit2,
    Settings,
    MoreVertical,
    Link,
    PlusCircle,
    Loader2,
    AlertTriangle
} from 'lucide-react'

import { SalesLinkDialog } from './sales-link-dialog'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Calendar as CalendarPicker } from '@/components/ui/calendar'
import { supabaseUntyped } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

// Stable components for editing to prevent focus loss
const InlineEditableTitle = ({
    initialTitle,
    initialSku,
    onTitleChange
}: {
    initialTitle: string,
    initialSku: string,
    onTitleChange: (v: string) => void
}) => {
    const [title, setTitle] = useState(initialTitle)
    React.useEffect(() => { setTitle(initialTitle) }, [initialTitle])

    return (
        <div className="flex flex-col gap-0.5">
            <input
                className="text-slate-600 text-sm bg-transparent border-none p-0 focus:ring-0 w-full font-medium focus:text-blue-600 decoration-dotted underline decoration-blue-200 cursor-text"
                value={title || ''}
                onChange={(e) => {
                    setTitle(e.target.value)
                    onTitleChange(e.target.value)
                }}
                placeholder="Variant Title"
            />
            <span className="text-[10px] text-slate-400 font-mono leading-none">
                {initialSku}
            </span>
        </div>
    )
}

const InlineEditableStock = ({
    initialValue,
    onChange
}: {
    initialValue: number,
    onChange: (v: number) => void
}) => {
    const [val, setVal] = useState(initialValue)
    React.useEffect(() => { setVal(initialValue) }, [initialValue])

    return (
        <div className="flex justify-center group/input">
            <input
                type="number"
                className="h-8 w-16 text-center font-mono font-bold text-slate-600 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50/50 rounded-md transition-all outline-none tabular-nums appearance-none p-0"
                value={val}
                onChange={(e) => {
                    const v = parseInt(e.target.value) || 0
                    setVal(v)
                    onChange(v)
                }}
            />
        </div>
    )
}


interface InventoryTableProps {
    products: ProductWithCalculations[]
    allProducts: ProductWithCalculations[]
    onRefresh?: () => void
}

interface InventoryNode extends Partial<ProductWithCalculations> {
    id: string
    is_spu: boolean
    subRows?: InventoryNode[]
    variant_count?: number
    sold_since_update?: number
    original: ProductWithCalculations | any
}

export function InventoryTable({ products, allProducts, onRefresh }: InventoryTableProps) {
    const [expanded, setExpanded] = useState<ExpandedState>({})
    const [pendingChanges, setPendingChanges] = useState<Map<number, { qty?: number, timestamp?: string, isManual?: boolean, title?: string, sku?: string }>>(new Map())
    const [isSaving, setIsSaving] = useState(false)
    const [deleteMode, setDeleteMode] = useState(false)
    const [pendingDeletions, setPendingDeletions] = useState<Set<string>>(new Set()) // Use "s-{id}" or "v-{id}"
    const [optimisticRemovedIds, setOptimisticRemovedIds] = useState<Set<string>>(new Set())
    const [showUntrackConfirm, setShowUntrackConfirm] = useState(false)



    // Sales Linking
    const [isSalesLinkDialogOpen, setIsSalesLinkDialogOpen] = useState(false)
    const [activeVariant, setActiveVariant] = useState<InventoryNode | null>(null)

    const data = useMemo<InventoryNode[]>(() => {
        const grouped = new Map<number, { variants: any[], baseTitle: string, image_url: string | null }>()

        products.forEach(p => {
            const spuId = p.shopify_product_id
            const varStrId = `v-${p.variant_id}`

            if (optimisticRemovedIds.has(`s-${spuId}`) || optimisticRemovedIds.has(varStrId)) return

            if (!grouped.has(spuId)) {
                grouped.set(spuId, { variants: [], baseTitle: '', image_url: null })
            }

            const group = grouped.get(spuId) as any
            group.variants.push(p)

            const isCustom = !!p.internal_meta?.custom_variant

            // 1. 优先使用元数据中的冻结标题
            if (p.internal_meta?.spu_title) {
                group.baseTitle = p.internal_meta.spu_title
                group.isFrozen = true
            }

            // 2. 如果还没有标题，或者当前标题不是冻结的且遇到了标准变体 (非 Custom)
            // 则尝试从变体标题中推导。一旦有了标准变体推导出的标题，就不再被 Custom 变体覆盖。
            if (!group.baseTitle || (!group.isFrozen && !isCustom && !group.hasStandardTitle)) {
                const titleParts = p.title.split(' - ')
                group.baseTitle = titleParts.length > 1 ? titleParts.slice(0, -1).join(' - ') : titleParts[0]
                if (!isCustom) group.hasStandardTitle = true
            }

            // Prefer standard images
            if (!group.image_url || (!isCustom && p.image_url)) {
                group.image_url = p.image_url
            }
        })

        const inventoryNodes: InventoryNode[] = []
        grouped.forEach((group, spuId) => {
            const sortedVariants = group.variants
            const variantCount = sortedVariants.length

            if (variantCount === 1) {
                const v = sortedVariants[0]
                inventoryNodes.push({
                    ...v,
                    id: `spu-${spuId}`,
                    is_spu: true,
                    shopify_product_id: spuId,
                    title: group.baseTitle,
                    image_url: group.image_url,
                    variant_count: 1,
                    subRows: [],
                    original: v,
                    internal_meta: v.internal_meta
                })
            } else {
                const subRows = sortedVariants.map(v => ({
                    ...v,
                    id: `v-${v.variant_id}`,
                    is_spu: false,
                    original: v
                }))

                inventoryNodes.push({
                    id: `spu-${spuId}`,
                    is_spu: true,
                    shopify_product_id: spuId,
                    title: group.baseTitle,
                    image_url: group.image_url,
                    variant_count: variantCount,
                    subRows,
                    original: sortedVariants[0], // Reference for SPU row
                    internal_meta: sortedVariants[0].internal_meta
                })
            }
        })

        return inventoryNodes
    }, [products])

    const handleInventoryChange = (variantId: number, value: string) => {
        const numValue = value === '' ? 0 : parseInt(value)
        if (isNaN(numValue)) return
        setPendingChanges(prev => {
            const next = new Map(prev)
            // When quantity changes, we reset the timestamp to automatic mode (undefined here defaults to 'now' in handleSave)
            next.set(variantId, { qty: numValue, timestamp: undefined, isManual: false })
            return next
        })
    }

    const handleTimestampChange = (variantId: number, date: Date | undefined) => {
        if (!date) return
        setPendingChanges(prev => {
            const next = new Map(prev)
            const current = next.get(variantId) || { qty: products.find(p => p.variant_id === variantId)?.internal_meta?.manual_inventory ?? 0 }
            next.set(variantId, { ...current, timestamp: date.toISOString(), isManual: true })
            return next
        })
    }


    const handleFieldChange = (variantId: number, field: string, value: any) => {
        setPendingChanges(prev => {
            const next = new Map(prev)
            const current = next.get(variantId) || {}
            next.set(variantId, { ...current, [field]: value })
            return next
        })
    }

    const handleSave = async () => {
        if (pendingChanges.size === 0) return
        setIsSaving(true)
        try {
            const updates = Array.from(pendingChanges.entries()).map(async ([variantId, change]) => {
                const product = products.find(p => p.variant_id === variantId)
                const updatedMeta = {
                    ...(product?.internal_meta || {}),
                    ...(change.qty !== undefined ? { manual_inventory: change.qty } : {}),
                    inventory_updated_at: change.timestamp || product?.internal_meta?.inventory_updated_at || new Date().toISOString(),
                    is_manual_timestamp: change.isManual ?? product?.internal_meta?.is_manual_timestamp ?? false
                }

                const updatePayload: any = { internal_meta: updatedMeta }
                if (change.title !== undefined) updatePayload.title = change.title
                if (change.sku !== undefined) updatePayload.sku = change.sku

                const { error } = await supabaseUntyped
                    .from('products')
                    .update(updatePayload)
                    .eq('variant_id', variantId)
                if (error) throw error
            })
            await Promise.all(updates)
            toast.success('Inventory saved')
            setPendingChanges(new Map())
            onRefresh?.()
        } catch (error) {
            toast.error('Failed to save')
        } finally {
            setIsSaving(false)
        }
    }

    const handleAddSku = async (spu: InventoryNode) => {
        setIsSaving(true)
        try {
            toast.loading('Creating custom variant...', { id: 'add-sku' })

            // Get base info from existing variants
            const { data: existingVars } = await supabaseUntyped
                .from('products')
                .select('*')
                .eq('shopify_product_id', spu.shopify_product_id)
                .limit(1)

            const baseVar = existingVars?.[0]
            const newVid = Date.now() * -1

            const newRow = {
                variant_id: newVid,
                shopify_product_id: spu.shopify_product_id,
                title: '', // Start empty for user to fill
                handle: baseVar?.handle || spu.title?.toLowerCase().replace(/ /g, '-'),
                sku: `CUSTOM-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
                price: baseVar?.price || 0,
                image_url: baseVar?.image_url || null, // Inherit from SPU
                inventory_quantity: 0,
                internal_meta: {
                    is_tracked_inventory: true,
                    spu_title: baseVar?.internal_meta?.spu_title || spu.title,
                    manual_inventory: 0,
                    inventory_updated_at: new Date().toISOString(),
                    custom_variant: true
                }
            }

            const { error } = await supabaseUntyped
                .from('products')
                .insert(newRow)

            if (error) throw error
            toast.success('Custom variant added. You can now edit its title.', { id: 'add-sku' })
            onRefresh?.()

            // Automatically expand the SPU if it's not
            setExpanded(prev => ({ ...(prev as Record<string, boolean>), [spu.shopify_product_id!]: true }))
        } catch (error: any) {
            toast.error(`Error: ${error.message}`, { id: 'add-sku' })
        } finally {
            setIsSaving(false)
        }
    }

    const handleOpenLinkSales = (variant: InventoryNode) => {
        setActiveVariant(variant)
        setIsSalesLinkDialogOpen(true)
    }

    const handleSaveLinks = async (links: any[]) => {
        if (!activeVariant) return

        setIsSaving(true)
        try {
            toast.loading('Updating sales links...', { id: 'save-links' })

            const updatedMeta = {
                ...(activeVariant.internal_meta || {}),
                sales_links: links
            }

            const { error } = await supabaseUntyped
                .from('products')
                .update({ internal_meta: updatedMeta })
                .eq('variant_id', activeVariant.variant_id)

            if (error) throw error

            toast.success('Sales links updated', { id: 'save-links' })
            onRefresh?.()
        } catch (error) {
            console.error('Failed to save links:', error)
            toast.error('Failed to save sales links', { id: 'save-links' })
        } finally {
            setIsSaving(false)
            setIsSalesLinkDialogOpen(false)
            setActiveVariant(null)
        }
    }

    const toggleDeletion = (id: string) => {
        setPendingDeletions(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    const handleBatchUnTrack = async () => {
        if (pendingDeletions.size === 0) return

        const idsArray = Array.from(pendingDeletions)
        const spuIds = idsArray.filter(id => id.startsWith('s-')).map(id => parseInt(id.replace('s-', '')))
        const variantIds = idsArray.filter(id => id.startsWith('v-')).map(id => parseInt(id.replace('v-', '')))

        setIsSaving(true)
        setShowUntrackConfirm(false)
        const toastId = toast.loading('Removing selections from tracking...')

        // Optimistic UI
        setOptimisticRemovedIds(prev => new Set([...Array.from(prev), ...idsArray]))
        setDeleteMode(false)
        setPendingDeletions(new Set())

        try {
            const response = await fetch('/api/inventory/untrack', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shopifyProductIds: spuIds,
                    variantIds: variantIds
                })
            })

            if (!response.ok) throw new Error('Failed to update tracking')

            if (onRefresh) await onRefresh()
            toast.success(`Removed selections from tracking`, { id: toastId })
        } catch (error) {
            console.error('Batch untrack error:', error)
            toast.error('Failed to update tracking', { id: toastId })
            setOptimisticRemovedIds(prev => {
                const next = new Set(prev)
                idsArray.forEach(id => next.delete(id))
                return next
            })
            onRefresh?.()
        } finally {
            setIsSaving(false)
            setOptimisticRemovedIds(new Set())
        }
    }

    const columns = useMemo<ColumnDef<InventoryNode>[]>(() => {
        const baseColumns: ColumnDef<InventoryNode>[] = []

        if (deleteMode) {
            baseColumns.push({
                id: 'select',
                size: 50,
                header: ({ table }) => (
                    <div className="flex justify-center">
                        <Checkbox
                            checked={
                                table.getRowModel().rows.filter(r => r.original.is_spu).every(r => pendingDeletions.has(`s-${r.original.shopify_product_id}`))
                            }
                            onCheckedChange={(value) => {
                                if (value) {
                                    const allIds = table.getRowModel().rows
                                        .filter(r => r.original.is_spu)
                                        .map(r => `s-${r.original.shopify_product_id}`)
                                    setPendingDeletions(new Set(allIds))
                                } else {
                                    setPendingDeletions(new Set())
                                }
                            }}
                        />
                    </div>
                ),
                cell: ({ row }) => {
                    const strId = row.original.is_spu
                        ? `s-${row.original.shopify_product_id}`
                        : `v-${row.original.variant_id}`

                    return (
                        <div className="flex justify-center">
                            <Checkbox
                                checked={pendingDeletions.has(strId)}
                                onCheckedChange={() => toggleDeletion(strId)}
                            />
                        </div>
                    )
                }
            })
        }

        baseColumns.push(
            {
                accessorKey: 'title',
                header: 'Product / Variant',
                size: 400,
                cell: ({ row }) => {
                    const isSpu = row.original.is_spu
                    return (
                        <div className={cn("flex items-center gap-2", !isSpu && "pl-8")}>
                            {isSpu && row.original.variant_count! > 1 && (
                                <button
                                    onClick={() => row.toggleExpanded()}
                                    className="h-6 w-6 flex items-center justify-center hover:bg-slate-100 rounded transition-colors"
                                >
                                    {row.getIsExpanded() ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </button>
                            )}
                            {isSpu && row.original.variant_count === 1 && <div className="w-6 shrink-0" />}
                            <div className="relative h-8 w-8 overflow-hidden rounded bg-slate-50 border shrink-0">
                                {row.original.image_url ? (
                                    <Image src={row.original.image_url} alt="" fill className="object-cover" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-slate-300">
                                        <Boxes className="h-4 w-4" />
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                                {isSpu ? (
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-900 truncate">{row.original.title}</span>
                                        {row.original.variant_count === 1 && (
                                            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-tighter mt-0.5">
                                                {row.original.sku}
                                            </span>
                                        )}
                                    </div>
                                ) : row.original.internal_meta?.custom_variant ? (
                                    <InlineEditableTitle
                                        initialTitle={pendingChanges.get(row.original.variant_id!)?.title ?? row.original.title ?? ''}
                                        initialSku={row.original.sku ?? ''}
                                        onTitleChange={(v: string) => handleFieldChange(row.original.variant_id!, 'title', v)}
                                    />
                                ) : (
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-slate-700 truncate">{row.original.title}</span>
                                        <span className="text-[10px] text-slate-400 font-mono uppercase tracking-tighter mt-0.5">
                                            {row.original.sku}
                                        </span>
                                    </div>
                                )}
                                {isSpu && row.original.variant_count! > 1 && <span className="text-[10px] text-slate-500 uppercase tracking-wider leading-none">{row.original.variant_count} Variants Registered</span>}
                            </div>

                            <div className="flex items-center gap-1 ml-auto shrink-0">
                                {isSpu && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-50 hover:text-blue-600"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleAddSku(row.original)
                                        }}
                                        title="Add Custom SKU"
                                    >
                                        <PlusCircle className="h-4 w-4" />
                                    </Button>
                                )}
                                {(row.original.internal_meta?.custom_variant && (row.original.variant_count === 1 || !isSpu)) && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:text-blue-600 hover:bg-blue-50"
                                        title="Link to online SKU sales"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleOpenLinkSales(row.original)
                                        }}
                                    >
                                        <Link className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    )
                },
            },
            {
                id: 'initial_stock',
                header: 'Initial Stock',
                size: 80,
                cell: ({ row, table }) => {
                    const meta = table.options.meta as any

                    if (row.original.is_spu && row.original.variant_count! > 1) {
                        const total = (row.original.subRows || []).reduce((sum, v) => {
                            const val = (meta.pendingChanges.has(v.variant_id!)
                                ? meta.pendingChanges.get(v.variant_id!)?.qty
                                : (v.internal_meta?.manual_inventory ?? v.inventory_quantity)) ?? 0
                            return sum + (val as number)
                        }, 0)
                        return (
                            <div className="flex justify-center">
                                <div className="w-16 text-center font-mono font-black text-slate-600">
                                    {total}
                                </div>
                            </div>
                        )
                    }

                    const vId = row.original.variant_id!
                    const val = (meta.pendingChanges.has(vId)
                        ? meta.pendingChanges.get(vId)?.qty
                        : (row.original.internal_meta?.manual_inventory ?? row.original.inventory_quantity)) ?? 0

                    return (
                        <InlineEditableStock
                            initialValue={val as number}
                            onChange={(v: number) => handleFieldChange(vId, 'qty', v)}
                        />
                    )
                },
            },
            {
                id: 'sold',
                header: 'Sold',
                size: 80,
                cell: ({ row, table }) => {
                    const meta = table.options.meta as any

                    if (row.original.is_spu && row.original.variant_count! > 1) {
                        const totalSold = (row.original.subRows || []).reduce((sum, v) => sum + (v.sold_since_update || 0), 0)
                        return (
                            <div className="flex justify-center">
                                <div className="w-16 text-center font-mono font-black text-slate-600">
                                    -{totalSold}
                                </div>
                            </div>
                        )
                    }

                    const vId = row.original.variant_id!
                    const hasTimestamp = !!(row.original.internal_meta?.inventory_updated_at || meta.pendingChanges.get(vId)?.timestamp)
                    const sold = row.original.sold_since_update || 0
                    const breakdown = row.original.sold_breakdown || []

                    if (!hasTimestamp && sold === 0) return (
                        <div className="flex justify-center text-slate-300 font-mono text-[10px] italic">not tracking</div>
                    )

                    const isCustomWithLinks = row.original.internal_meta?.custom_variant && breakdown.length > 0

                    const SoldContent = (
                        <span className={cn(
                            "inline-block w-16 text-center font-mono font-bold transition-all tabular-nums",
                            sold > 0 ? "text-slate-600" : "text-slate-600",
                            isCustomWithLinks && "cursor-pointer underline decoration-dotted underline-offset-4 decoration-slate-400 hover:text-slate-900"
                        )}>
                            -{sold}
                        </span>
                    )

                    if (!isCustomWithLinks) {
                        return (
                            <div className="flex justify-center">
                                {SoldContent}
                            </div>
                        )
                    }

                    return (
                        <div className="flex justify-center">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button className="focus:outline-none p-0 border-0 bg-transparent block">
                                        {SoldContent}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[300px] p-4 rounded-xl shadow-2xl border-slate-100" align="center" side="top" sideOffset={8}>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <TrendingDown className="h-4 w-4 text-orange-500" />
                                                <h4 className="font-bold text-slate-900 text-sm tracking-tight uppercase">Sold Breakdown</h4>
                                            </div>
                                            <Badge variant="outline" className="text-[9px] font-black uppercase text-slate-400">Live Delta</Badge>
                                        </div>

                                        <div className="space-y-1">
                                            {breakdown.length > 0 ? (
                                                breakdown.map((item, idx) => (
                                                    <div key={idx} className="group p-2.5 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-110">
                                                        <div className="flex justify-between items-center gap-4">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-1.5">
                                                                    {item.is_direct ? (
                                                                        <TrendingDown className="h-3 w-3 text-blue-500" />
                                                                    ) : (
                                                                        <GitBranch className="h-3 w-3 text-orange-500" />
                                                                    )}
                                                                    <span className="text-[11px] font-bold text-slate-900 truncate">{item.title}</span>
                                                                </div>
                                                                <div className="text-[10px] text-slate-400 mt-0.5 font-medium flex items-center gap-2">
                                                                    <span>Qty: {item.qty}</span>
                                                                    <span className="text-slate-200">|</span>
                                                                    <span>Weight: {item.weight}</span>
                                                                </div>
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <div className="text-[11px] font-mono font-bold text-orange-600">-{Math.round(item.qty * item.weight)}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center py-8 text-xs text-slate-400 italic bg-slate-50/50 rounded-xl border border-dashed border-slate-100">
                                                    No sales activity found.
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/50 -mx-4 -mb-4 p-4 rounded-b-xl">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Net Reduction</span>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-xs font-bold text-orange-400">-</span>
                                                <span className="text-2xl font-black text-orange-600 tabular-nums">{sold}</span>
                                            </div>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    )
                },
            },
            {
                id: 'on_hand',
                header: 'On Hand',
                size: 80,
                cell: ({ row, table }) => {
                    const meta = table.options.meta as any

                    if (row.original.is_spu && row.original.variant_count! > 1) {
                        const totalOnHand = (row.original.subRows || []).reduce((sum, v) => {
                            const pending = meta.pendingChanges.get(v.variant_id!)
                            const initial = (pending?.qty !== undefined
                                ? pending.qty
                                : (v.internal_meta?.manual_inventory ?? v.inventory_quantity)) ?? 0
                            const sold = v.sold_since_update || 0
                            return sum + (initial - sold)
                        }, 0)
                        return (
                            <div className="flex justify-center">
                                <div className="w-16 text-center font-mono font-black text-slate-600">
                                    {totalOnHand}
                                </div>
                            </div>
                        )
                    }

                    const vId = row.original.variant_id!
                    const pending = meta.pendingChanges.get(vId)
                    const hasTimestamp = !!(row.original.internal_meta?.inventory_updated_at || pending?.timestamp)

                    const initial = (pending?.qty !== undefined
                        ? pending.qty
                        : (row.original.internal_meta?.manual_inventory ?? row.original.inventory_quantity)) ?? 0
                    const sold = row.original.sold_since_update || 0
                    const onHand = initial - sold

                    if (!hasTimestamp) {
                        return (
                            <div className="flex justify-center">
                                <div className="w-16 text-center font-mono text-slate-600 font-medium">
                                    {initial}
                                </div>
                            </div>
                        )
                    }

                    return (
                        <div className="flex justify-center">
                            <div className="w-16 text-center font-mono font-bold text-slate-600 tabular-nums">
                                {onHand}
                            </div>
                        </div>
                    )
                },
            },
            {
                id: 'last_counted',
                header: 'Last Counted',
                size: 140,
                cell: ({ row, table }) => {
                    if (row.original.is_spu && row.original.variant_count! > 1) return null
                    const vId = row.original.variant_id!
                    const product = row.original
                    const meta = table.options.meta as any
                    const pending = meta.pendingChanges.get(vId)

                    const timestamp = pending?.timestamp || product.internal_meta?.inventory_updated_at
                    const isManual = pending?.isManual || product.internal_meta?.is_manual_timestamp

                    if (!timestamp) return <div className="text-center text-slate-300">-</div>

                    const date = new Date(timestamp)

                    return (
                        <div className="flex justify-center">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-7 text-[10px] px-2 gap-1.5 relative",
                                            isManual ? "text-amber-600 bg-amber-50 hover:bg-amber-100" : "text-slate-500 hover:bg-slate-100",
                                            "data-[state=open]:bg-slate-100 data-[state=open]:text-blue-600"
                                        )}
                                    >
                                        <Calendar className="h-3 w-3" />
                                        {format(date, 'MMM d, HH:mm')}
                                        {isManual && <div className="h-1 w-1 rounded-full bg-amber-500" />}
                                        {pending?.timestamp && (
                                            <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 border-2 border-white" />
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                    <div className="p-3 border-b flex items-center justify-between">
                                        <span className="text-xs font-bold">Adjust Timestamp</span>
                                        <Clock className="h-3 w-3 text-slate-400" />
                                    </div>
                                    <CalendarPicker
                                        mode="single"
                                        selected={date}
                                        onSelect={(d) => meta.handleTimestampChange(vId, d)}
                                        initialFocus
                                    />
                                    <div className="p-2 border-t bg-slate-50">
                                        <p className="text-[10px] text-slate-500 text-center">
                                            {isManual ? 'Manual override active.' : 'Sales after this time will be subtracted.'}
                                        </p>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    )
                },
            }
        )

        return baseColumns
    }, [deleteMode, pendingDeletions]) // REMOVED pendingChanges from deps to keep column stability 突破

    const table = useReactTable({
        data,
        columns,
        state: { expanded },
        onExpandedChange: setExpanded,
        getCoreRowModel: getCoreRowModel(),
        getExpandedRowModel: getExpandedRowModel(),
        getSubRows: row => row.subRows,
        meta: {
            pendingChanges,
            handleFieldChange,
            handleTimestampChange
        }
    })

    return (
        <div className="flex flex-col">
            {/* Table Header Controls */}
            <div className="p-4 border-b flex items-center justify-between bg-white">
                <div className="flex items-center gap-4">
                    <div className="text-sm">
                        <span className="text-slate-400">Recording</span>
                        <span className="mx-2 font-bold text-slate-900">{data.length} SPUs</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Delete Mode Toggle */}
                    {!deleteMode ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-red-500 hover:bg-red-50"
                            onClick={() => {
                                setDeleteMode(true)
                                setPendingChanges(new Map()) // Clear edits when entering delete mode
                            }}
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove Items
                        </Button>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-red-500 px-2 py-1 bg-red-50 rounded-full animate-pulse">
                                DELETE MODE ACTIVE
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setDeleteMode(false)
                                    setPendingDeletions(new Set())
                                }}
                            >
                                <X className="h-4 w-4 mr-2" />
                                Cancel
                            </Button>
                            <Dialog open={showUntrackConfirm} onOpenChange={setShowUntrackConfirm}>
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={pendingDeletions.size === 0 || isSaving}
                                    onClick={() => setShowUntrackConfirm(true)}
                                    className="bg-red-600"
                                >
                                    {isSaving ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <Check className="h-4 w-4 mr-2" />
                                    )}
                                    Stop Tracking {pendingDeletions.size} items
                                </Button>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle className="flex items-center gap-2 text-red-600">
                                            <AlertTriangle className="h-5 w-5" />
                                            Confirm Untrack
                                        </DialogTitle>
                                        <DialogDescription className="py-2">
                                            Are you sure you want to stop tracking these {pendingDeletions.size} items?
                                            This will remove them from your active inventory list.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setShowUntrackConfirm(false)}>
                                            Cancel
                                        </Button>
                                        <Button variant="destructive" onClick={handleBatchUnTrack} disabled={isSaving}>
                                            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                            Yes, Stop Tracking
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    )}

                    {/* Pending Changes Controls */}
                    {!deleteMode && pendingChanges.size > 0 && (
                        <div className="flex items-center gap-2 ml-4 border-l pl-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPendingChanges(new Map())}
                                className="text-slate-500"
                            >
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Revert
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleSave}
                                disabled={isSaving}
                                className="bg-blue-600 text-white hover:bg-blue-700 shadow-sm font-bold"
                            >
                                <Save className="h-4 w-4 mr-2" />
                                Commit {pendingChanges.size} Edits
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                    <thead>
                        {table.getHeaderGroups().map(headerGroup => (
                            <tr key={headerGroup.id} className="bg-slate-50 border-b">
                                {headerGroup.headers.map(header => (
                                    <th
                                        key={header.id}
                                        className={cn(
                                            "px-2 h-12 text-[11px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap overflow-hidden",
                                            header.column.id === 'title' ? "text-left" : "text-center"
                                        )}
                                        style={{ width: header.getSize() }}
                                    >
                                        {flexRender(header.column.columnDef.header, header.getContext())}
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {table.getRowModel().rows.map(row => (
                            <tr
                                key={row.id}
                                className={cn(
                                    "transition-colors group",
                                    row.original.is_spu ? "bg-white hover:bg-slate-50/50" : "bg-slate-50/20 hover:bg-slate-50",
                                    deleteMode && pendingDeletions.has(
                                        row.original.is_spu
                                            ? `s-${row.original.shopify_product_id}`
                                            : `v-${row.original.variant_id}`
                                    ) && "bg-red-50/30"
                                )}
                            >
                                {row.getVisibleCells().map(cell => (
                                    <td
                                        key={cell.id}
                                        className="px-2 py-3 align-middle overflow-hidden"
                                        style={{ width: cell.column.getSize() }}
                                    >
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
                {data.length === 0 && (
                    <div className="py-20 text-center text-slate-400 text-sm">
                        No tracked products found. Use the &quot;Track SPU&quot; button to add some.
                    </div>
                )}
            </div>
            <SalesLinkDialog
                open={isSalesLinkDialogOpen}
                onOpenChange={setIsSalesLinkDialogOpen}
                variant={activeVariant ? {
                    id: activeVariant.variant_id!,
                    title: activeVariant.title || '',
                    sku: activeVariant.sku,
                    shopify_product_id: activeVariant.shopify_product_id, // Pass SPU ID for filtering
                    internal_meta: activeVariant.internal_meta
                } : null}
                allProducts={allProducts}
                onSave={handleSaveLinks}
            />
        </div>
    )
}
