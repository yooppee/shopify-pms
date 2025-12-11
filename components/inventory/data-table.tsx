'use client'

import React, { useMemo, useState, useEffect, useCallback } from 'react'
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getExpandedRowModel,
    ColumnDef,
    flexRender,
    SortingState,
    ColumnFiltersState,
    ExpandedState,
    Row,
    ColumnSizingState,
    ColumnOrderState,
} from '@tanstack/react-table'
import { ProductWithCalculations } from '@/lib/supabase/types'
import { formatCurrency, formatNumber, calculateGrossProfit } from '@/lib/utils'
import { EditableCell } from './editable-cell'
import { ColumnVisibility } from './column-visibility'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RefreshCw, Search, ChevronRight, ChevronDown, Save, Undo2, X, Trash2, Filter } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import Image from 'next/image'
import { supabaseUntyped } from '@/lib/supabase/client'
import { DiffCell } from './sync-indicator'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

// 扩展类型以支持层级结�?
interface ProductNode extends Partial<ProductWithCalculations> {
    id: string // Unique ID for table (SPU ID or Variant ID)
    is_spu: boolean
    is_deleted?: boolean // Mark if product/variant is deleted in Shopify
    has_changes?: boolean // Mark if product has sync changes
    subRows?: ProductNode[]

    // SPU 聚合数据
    variant_count?: number
    total_inventory?: number
    price_range?: string
    compare_at_price_range?: string
    total_cost?: number
    total_profit?: number

    // 原始数据 (仅变体有)
    original_product?: ProductWithCalculations
    sync_product?: ProductWithCalculations // For diff comparison
}

// 待保存的更改记录
interface PendingChange {
    variantId: number
    field: string
    value: any
}

interface InventoryDataTableProps {
    products: ProductWithCalculations[]
    pendingSyncData?: ProductWithCalculations[] // New prop for sync preview
    pendingWeightData?: any[] // New prop for weight update preview
    onSaveSync?: () => void
    onDiscardSync?: () => void
    onSaveWeight?: () => void // New handler for weight save
    onDiscardWeight?: () => void // New handler for weight discard
    isSyncing?: boolean // New prop to indicate sync in progress
    isUpdatingWeight?: boolean // New prop to indicate weight update in progress
    onRefresh?: () => void // Callback to refresh parent data
}

export function InventoryDataTable({
    products,
    pendingSyncData,
    pendingWeightData,
    onSaveSync,
    onDiscardSync,
    onSaveWeight,
    onDiscardWeight,
    isSyncing = false,
    isUpdatingWeight = false,
    onRefresh,
}: InventoryDataTableProps) {
    const [sorting, setSorting] = useState<SortingState>([])
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
    const [globalFilter, setGlobalFilter] = useState('')
    const [expanded, setExpanded] = useState<ExpandedState>({})
    const [localProducts, setLocalProducts] = useState(products)
    const [pendingChanges, setPendingChanges] = useState<Map<string, PendingChange>>(new Map())
    const [isSaving, setIsSaving] = useState(false)
    const [deleteMode, setDeleteMode] = useState(false)
    const [pendingDeletions, setPendingDeletions] = useState<Set<string>>(new Set())
    const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
    const [overwriteDialog, setOverwriteDialog] = useState<{
        isOpen: boolean
        spuId: number
        field: string
        value: any
        conflictingCount: number
        totalCount: number
    }>({
        isOpen: false,
        spuId: 0,
        field: '',
        value: null,
        conflictingCount: 0,
        totalCount: 0
    })
    const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('inventory-column-order')
            if (saved) {
                try {
                    return JSON.parse(saved)
                } catch {
                    return []
                }
            }
        }
        return []
    })
    const [draggedColumn, setDraggedColumn] = useState<string | null>(null)
    const [vendorFilter, setVendorFilter] = useState<Set<string>>(new Set())

    // Extract unique vendors for filter dropdown
    const uniqueVendors = useMemo(() => {
        const vendors = new Set<string>()
        localProducts.forEach(product => {
            const vendor = product.internal_meta?.vendor
            if (vendor) vendors.add(vendor)
        })
        return Array.from(vendors).sort()
    }, [localProducts])

    // Drag and drop handlers for column reordering
    const handleDragStart = useCallback((e: React.DragEvent, columnId: string) => {
        setDraggedColumn(columnId)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', columnId)
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }, [])

    const handleDragEnd = useCallback(() => {
        setDraggedColumn(null)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent, targetColumnId: string, allColumnIds: string[]) => {
        e.preventDefault()
        const sourceColumnId = e.dataTransfer.getData('text/plain')

        // Fixed columns that cannot be reordered
        const FIXED_COLS = ['delete', 'expander', 'image', 'title']

        // Don't allow dropping on or moving fixed columns
        if (FIXED_COLS.includes(sourceColumnId) || FIXED_COLS.includes(targetColumnId)) {
            setDraggedColumn(null)
            return
        }

        if (sourceColumnId === targetColumnId || !sourceColumnId) {
            setDraggedColumn(null)
            return
        }

        // Get current movable columns order from localStorage
        let savedMovable: string[] = []
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('inventory-column-order')
                if (saved) savedMovable = JSON.parse(saved)
            } catch { }
        }

        // Get all movable columns from current columns
        const allMovable = allColumnIds.filter(id => !FIXED_COLS.includes(id))
        const orderedMovable = savedMovable.filter(id => allMovable.includes(id))
        const missingMovable = allMovable.filter(id => !orderedMovable.includes(id))
        const currentMovableOrder = [...orderedMovable, ...missingMovable]

        // Reorder within movable columns only
        const sourceIndex = currentMovableOrder.indexOf(sourceColumnId)
        const targetIndex = currentMovableOrder.indexOf(targetColumnId)

        if (sourceIndex === -1 || targetIndex === -1) {
            setDraggedColumn(null)
            return
        }

        const newMovableOrder = [...currentMovableOrder]
        newMovableOrder.splice(sourceIndex, 1)
        newMovableOrder.splice(targetIndex, 0, sourceColumnId)

        // Save movable order to localStorage
        localStorage.setItem('inventory-column-order', JSON.stringify(newMovableOrder))

        // Build full order: fixed columns (in fixed order) + new movable order
        const fixedCols = FIXED_COLS.filter(id => allColumnIds.includes(id))
        const newFullOrder = [...fixedCols, ...newMovableOrder]

        setColumnOrder(newFullOrder)
        setDraggedColumn(null)
    }, [])

    // Debug: Log when pendingSyncData changes
    useEffect(() => {
        console.log('🎯 pendingSyncData prop changed:', pendingSyncData?.length, 'products')
    }, [pendingSyncData])

    // 更新本地产品数据
    useEffect(() => {
        setLocalProducts(products)
        // 清空待保存的更改（数据已刷新�?
        setPendingChanges(new Map())
    }, [products])

    // 处理内部元数据更�?- 只更新本地状态并记录待保存的更改
    const handleUpdate = useCallback((variantId: number, field: string, value: any) => {
        const now = new Date().toISOString()

        // 更新本地产品数据
        setLocalProducts(prev => prev.map(product => {
            if (product.variant_id === variantId) {
                const updatedMeta: Record<string, any> = {
                    ...product.internal_meta,
                    [field]: value
                }
                // 如果是库存字段，同时更新时间�?
                if (field === 'manual_inventory') {
                    updatedMeta.inventory_updated_at = now
                }
                return {
                    ...product,
                    internal_meta: updatedMeta
                }
            }
            return product
        }))

        // 记录待保存的更改
        const changeKey = `${variantId}-${field}`
        setPendingChanges(prev => {
            const newChanges = new Map(prev)
            newChanges.set(changeKey, { variantId, field, value })
            // 如果是库存字段，同时记录时间戳更�?
            if (field === 'manual_inventory') {
                newChanges.set(`${variantId}-inventory_updated_at`, {
                    variantId,
                    field: 'inventory_updated_at',
                    value: now
                })
            }
            return newChanges
        })
    }, [])

    // 处理 SPU 级别的更新 (带级联逻辑)
    const handleSPUUpdate = useCallback((spuId: number, field: string, value: any) => {
        // 找到该 SPU 下的所有 variants
        const variants = localProducts.filter(p => p.shopify_product_id === spuId)
        if (variants.length === 0) return

        // 检查是否有由于已有值而产生的冲突 (非空且不等于新值)
        const conflictingVariants = variants.filter(v => {
            const currentValue = v.internal_meta?.[field]
            // 如果当前值为空，不算冲突
            if (currentValue === null || currentValue === undefined || currentValue === '') return false
            // 如果当前值等于新值，不算冲突
            return currentValue !== value
        })

        if (conflictingVariants.length > 0) {
            // 打开覆盖确认弹窗
            setOverwriteDialog({
                isOpen: true,
                spuId,
                field,
                value,
                conflictingCount: conflictingVariants.length,
                totalCount: variants.length
            })
        } else {
            // 没有冲突，直接应用到所有 variants
            applySPUUpdate(spuId, field, value, 'overwrite')
        }
    }, [localProducts])

    // 执行 SPU 更新应用
    const applySPUUpdate = useCallback((spuId: number, field: string, value: any, mode: 'overwrite' | 'fill-empty') => {
        const now = new Date().toISOString()
        const variantsToUpdate = localProducts.filter(p => p.shopify_product_id === spuId)

        // 更新本地状态
        setLocalProducts(prev => prev.map(product => {
            if (product.shopify_product_id !== spuId) return product

            // 检查是否需要更新该 variant
            const currentValue = product.internal_meta?.[field]
            const isEmpty = currentValue === null || currentValue === undefined || currentValue === ''

            // 如果是 "fill-empty" 模式且当前非空，则跳过
            if (mode === 'fill-empty' && !isEmpty) return product

            const updatedMeta: Record<string, any> = {
                ...product.internal_meta,
                [field]: value
            }

            return {
                ...product,
                internal_meta: updatedMeta
            }
        }))

        // 记录待保存的更改
        setPendingChanges(prev => {
            const newChanges = new Map(prev)
            variantsToUpdate.forEach(variant => {
                const currentValue = variant.internal_meta?.[field]
                const isEmpty = currentValue === null || currentValue === undefined || currentValue === ''

                if (mode === 'fill-empty' && !isEmpty) return

                const changeKey = `${variant.variant_id}-${field}`
                newChanges.set(changeKey, {
                    variantId: variant.variant_id,
                    field,
                    value
                })
            })
            return newChanges
        })

        // 关闭弹窗
        setOverwriteDialog(prev => ({ ...prev, isOpen: false }))
    }, [localProducts])

    // 批量保存所有待保存的更�?
    const handleSave = async () => {
        console.log('💾 handleSave called with:', {
            pendingChanges: pendingChanges.size,
            pendingDeletions: pendingDeletions.size,
            hasPendingSyncData: !!pendingSyncData,
            pendingSyncDataCount: pendingSyncData?.length
        })

        if (pendingChanges.size === 0 && pendingDeletions.size === 0 && !pendingSyncData && !pendingWeightData) {
            console.log('⏭️ No changes to save, returning early')
            return
        }

        setIsSaving(true)

        try {
            // First, save any pending local changes (cost, vendor, notes, inventory edits)
            if (pendingChanges.size > 0) {
                // �?variantId 分组更改
                const changesByVariant = new Map<number, Record<string, any>>()

                pendingChanges.forEach(change => {
                    if (!changesByVariant.has(change.variantId)) {
                        changesByVariant.set(change.variantId, {})
                    }
                    changesByVariant.get(change.variantId)![change.field] = change.value
                })

                // 对每�?variant 执行更新
                const updatePromises = Array.from(changesByVariant.entries()).map(async ([variantId, fieldChanges]) => {
                    // 获取当前 internal_meta
                    const { data: currentProduct, error: fetchError } = await supabaseUntyped
                        .from('products')
                        .select('internal_meta')
                        .eq('variant_id', variantId)
                        .single()

                    if (fetchError) throw fetchError

                    // 合并更改
                    const updatedMeta = {
                        ...(currentProduct?.internal_meta || {}),
                        ...fieldChanges
                    }

                    // 更新数据�?
                    const { error } = await supabaseUntyped
                        .from('products')
                        .update({ internal_meta: updatedMeta })
                        .eq('variant_id', variantId)

                    if (error) throw error
                })

                await Promise.all(updatePromises)

                // 清空待保存的更改
                setPendingChanges(new Map())
            }

            // Process deletions FIRST if in delete mode (before sync)
            if (pendingDeletions.size > 0) {
                console.log('🗑�?Processing deletions...')
                await handleConfirmDelete()
                // handleConfirmDelete will reload the page, so we return here
                return
            }

            // Then, process sync data if in preview mode (only if no deletions)
            if (pendingSyncData && onSaveSync) {
                console.log('📡 Calling onSaveSync...')
                onSaveSync()
                setIsSaving(false) // Clear local saving state since sync is handled by parent mutation
                return
            }

            // Process weight updates if in weight preview mode
            if (pendingWeightData && onSaveWeight) {
                console.log('⚖️ Calling onSaveWeight...')
                onSaveWeight()
                setIsSaving(false) // Clear local saving state since weight update is handled by parent mutation
                return
            }

            // If we reach here, only local changes were saved
            setIsSaving(false)
        } catch (error) {
            console.error('Failed to save changes:', error)
            alert('保存失败，请重试')
            setIsSaving(false)
        }
    }

    // 处理删除�?
    const handleDeleteToggle = useCallback((rowId: string) => {
        setPendingDeletions(prev => {
            const next = new Set(prev)
            if (next.has(rowId)) {
                next.delete(rowId)
            } else {
                next.add(rowId)
            }
            return next
        })
    }, [])

    // 处理全选删�?
    const handleDeleteAllToggle = useCallback((rows: Row<ProductNode>[]) => {
        setPendingDeletions(prev => {
            const next = new Set(prev)
            const allSelected = rows.every(row => next.has(row.original.id!))

            rows.forEach(row => {
                if (allSelected) {
                    next.delete(row.original.id!)
                } else {
                    next.add(row.original.id!)
                }
            })
            return next
        })
    }, [])

    // 真正执行删除
    const handleConfirmDelete = async () => {
        setIsSaving(true)
        try {
            // 收集要删除的 variant IDs
            const variantIdsToDelete: number[] = []

            // 遍历所有待删除ID
            pendingDeletions.forEach(id => {
                if (id.startsWith('variant-')) {
                    variantIdsToDelete.push(parseInt(id.replace('variant-', '')))
                } else if (id.startsWith('spu-')) {
                    // 如果是SPU，找到对应的variants (需要从 localProducts 中查�?
                    const spuId = parseInt(id.replace('spu-', ''))
                    const variants = localProducts.filter(p => p.shopify_product_id === spuId)
                    variants.forEach(v => variantIdsToDelete.push(v.variant_id))
                }
            })

            console.log('🗑�?Delete requested for IDs:', pendingDeletions)
            console.log('🗑�?Variant IDs to delete:', variantIdsToDelete)

            if (variantIdsToDelete.length === 0) {
                console.warn('⚠️ No variants to delete!')
                return
            }

            // Use server-side API to delete (bypasses RLS)
            const response = await fetch('/api/products/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ variantIds: variantIdsToDelete })
            })

            const result = await response.json()
            console.log('🗑�?Delete result:', result)

            if (!response.ok || !result.success) {
                console.error('�?Delete API failed:', result)
                throw new Error(result.error || result.details || 'Delete failed')
            }

            setLocalProducts(prev => prev.filter(p => !variantIdsToDelete.includes(p.variant_id)))
            setPendingDeletions(new Set())
            setDeleteMode(false)
            // Refresh parent data to update subtitle
            onRefresh?.()
            alert('删除成功 / Delete successful')
        } catch (error: any) {
            console.error('Failed to delete products:', error)
            alert(`删除失败: ${error.message || 'Unknown error'}`)
        } finally {
            setIsSaving(false)
        }
    }

    // 构建层级数据 (SPU -> Variants)
    const data = useMemo<ProductNode[]>(() => {
        const grouped = new Map<number, ProductWithCalculations[]>()

        localProducts.forEach(product => {
            const spuId = product.shopify_product_id
            if (!grouped.has(spuId)) {
                grouped.set(spuId, [])
            }
            grouped.get(spuId)!.push(product)
        })

        // 如果有同步预览数据，进行对比 merge 和排�?
        if (pendingSyncData) {
            console.log('🔍 pendingSyncData detected:', pendingSyncData?.length, 'products')
            const syncMap = new Map(pendingSyncData.map(p => [p.variant_id, p]))
            const dbVariantIds = new Set(localProducts.map(p => p.variant_id))

            // 找出有差异的行和新增的行
            const diffRows: ProductNode[] = []
            const normalRows: ProductNode[] = []
            const newRows: ProductNode[] = []

            // Process existing products with diffs
            const processedNodes = Array.from(grouped.entries()).map(([spuId, variants]) => {
                const firstVariant = variants[0]
                // Extract base title by removing the last part (variant name) after the last ' - '
                const titleParts = firstVariant.title.split(' - ')
                const baseTitle = titleParts.length > 1 ? titleParts.slice(0, -1).join(' - ') : titleParts[0]

                // 计算价格范围
                const prices = variants.map(v => v.price)
                const minPrice = Math.min(...prices)
                const maxPrice = Math.max(...prices)
                const priceRange = minPrice === maxPrice
                    ? formatCurrency(minPrice)
                    : `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`

                // 计算划线价范�?
                const comparePrices = variants
                    .map(v => v.compare_at_price)
                    .filter((p): p is number => p !== null)

                let compareRange = '-'
                if (comparePrices.length > 0) {
                    const minCompare = Math.min(...comparePrices)
                    const maxCompare = Math.max(...comparePrices)
                    compareRange = minCompare === maxCompare
                        ? formatCurrency(minCompare)
                        : `${formatCurrency(minCompare)} - ${formatCurrency(maxCompare)}`
                }

                // Check for diffs in variants
                let hasDiffs = false
                const subRows: ProductNode[] = variants.map(v => {
                    const syncVariant = syncMap.get(v.variant_id)

                    // Compare with type coercion to handle number vs string issues
                    const dbPrice = Number(v.price)
                    const dbInventory = Number(v.inventory_quantity)
                    const dbCompareAt = v.compare_at_price !== null ? Number(v.compare_at_price) : null

                    const syncPrice = syncVariant ? Number(syncVariant.price) : null
                    const syncInventory = syncVariant ? Number(syncVariant.inventory_quantity) : null
                    const syncCompareAt = syncVariant?.compare_at_price !== null && syncVariant?.compare_at_price !== undefined
                        ? Number(syncVariant.compare_at_price)
                        : null

                    // Check for title and image changes
                    const titleDiff = syncVariant && v.title !== syncVariant.title
                    const imageDiff = syncVariant && v.image_url !== syncVariant.image_url

                    // Debug: Log type info for first few comparisons
                    if (syncVariant) {
                        const priceDiff = syncPrice !== dbPrice
                        const invDiff = syncInventory !== dbInventory
                        const compareDiff = syncCompareAt !== dbCompareAt

                        if (priceDiff || invDiff || compareDiff || titleDiff || imageDiff) {
                            console.log(`🔍 Diff detected for variant ${v.variant_id}:`, {
                                title: v.title,
                                price: {
                                    shopify: syncPrice,
                                    db: dbPrice,
                                    shopifyType: typeof syncVariant.price,
                                    dbType: typeof v.price,
                                    diff: priceDiff
                                },
                                inventory: {
                                    shopify: syncInventory,
                                    db: dbInventory,
                                    diff: invDiff
                                },
                                compare_at: {
                                    shopify: syncCompareAt,
                                    db: dbCompareAt,
                                    shopifyType: typeof syncVariant.compare_at_price,
                                    dbType: typeof v.compare_at_price,
                                    diff: compareDiff
                                },
                                title_change: {
                                    shopify: syncVariant.title,
                                    db: v.title,
                                    diff: titleDiff
                                },
                                image_change: {
                                    shopify: syncVariant.image_url,
                                    db: v.image_url,
                                    diff: imageDiff
                                }
                            })
                        }
                    }

                    const isDiff = syncVariant && (
                        syncPrice !== dbPrice ||
                        syncInventory !== dbInventory ||
                        syncCompareAt !== dbCompareAt ||
                        titleDiff ||
                        imageDiff
                    )
                    if (isDiff) hasDiffs = true

                    return {
                        ...v,
                        id: `variant-${v.variant_id}`,
                        is_spu: false,
                        original_product: v,
                        sync_product: syncVariant
                    }
                })

                const node: ProductNode = {
                    id: `spu-${spuId}`,
                    is_spu: true,
                    shopify_product_id: spuId,
                    title: baseTitle,
                    handle: firstVariant.handle,
                    image_url: firstVariant.image_url,
                    variant_count: variants.length,
                    total_inventory: variants.reduce((sum, v) => sum + (v.internal_meta?.manual_inventory ?? v.inventory_quantity), 0),
                    price_range: priceRange,
                    compare_at_price_range: compareRange,
                    total_cost: variants.reduce((sum, v) => sum + (v.internal_meta?.cost_price || 0), 0),
                    total_profit: variants.reduce((sum, v) => {
                        const profit = calculateGrossProfit(
                            v.price,
                            v.internal_meta?.cost_price
                        )
                        return sum + (profit || 0)
                    }, 0),
                    subRows,
                    has_changes: hasDiffs
                }
                return node
            })

            // Process new products from Shopify (not in DB)
            const newProductsGrouped = new Map<number, ProductWithCalculations[]>()
            const newVariantsList: number[] = []
            pendingSyncData.forEach(syncProduct => {
                if (!dbVariantIds.has(syncProduct.variant_id)) {
                    newVariantsList.push(syncProduct.variant_id)
                    const spuId = syncProduct.shopify_product_id
                    if (!newProductsGrouped.has(spuId)) {
                        newProductsGrouped.set(spuId, [])
                    }
                    newProductsGrouped.get(spuId)!.push(syncProduct)
                }
            })

            // Debug: Log which variants are considered "new"
            if (newVariantsList.length > 0) {
                console.log(`🆕 NEW products (in Shopify but NOT in DB): ${newVariantsList.length} variants`)
                console.log('   Variant IDs:', newVariantsList)
                console.log('   DB has:', dbVariantIds.size, 'variants')
                console.log('   Shopify has:', pendingSyncData.length, 'variants')
            }

            // Create nodes for new products
            Array.from(newProductsGrouped.entries()).forEach(([spuId, variants]) => {
                const firstVariant = variants[0]
                // Extract base title by removing the last part (variant name) after the last ' - '
                const titleParts = firstVariant.title.split(' - ')
                const baseTitle = titleParts.length > 1 ? titleParts.slice(0, -1).join(' - ') : titleParts[0]

                const prices = variants.map(v => v.price)
                const minPrice = Math.min(...prices)
                const maxPrice = Math.max(...prices)
                const priceRange = minPrice === maxPrice
                    ? formatCurrency(minPrice)
                    : `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`

                const comparePrices = variants
                    .map(v => v.compare_at_price)
                    .filter((p): p is number => p !== null)

                let compareRange = '-'
                if (comparePrices.length > 0) {
                    const minCompare = Math.min(...comparePrices)
                    const maxCompare = Math.max(...comparePrices)
                    compareRange = minCompare === maxCompare
                        ? formatCurrency(minCompare)
                        : `${formatCurrency(minCompare)} - ${formatCurrency(maxCompare)}`
                }

                const subRows: ProductNode[] = variants.map(v => ({
                    ...v,
                    id: `variant-${v.variant_id}`,
                    is_spu: false,
                    original_product: v,
                    sync_product: v, // New product, so sync_product is itself
                }))

                const node: ProductNode = {
                    id: `spu-${spuId}`,
                    is_spu: true,
                    shopify_product_id: spuId,
                    title: baseTitle,
                    handle: firstVariant.handle,
                    image_url: firstVariant.image_url,
                    variant_count: variants.length,
                    total_inventory: variants.reduce((sum, v) => sum + v.inventory_quantity, 0),
                    price_range: priceRange,
                    compare_at_price_range: compareRange,
                    total_cost: 0,
                    total_profit: 0,
                    subRows,
                    has_changes: true, // New products are always marked as changed
                }
                newRows.push(node)
            })

            // Process deleted products (in DB but not in Shopify)
            const deletedProductsGrouped = new Map<number, ProductWithCalculations[]>()
            const deletedVariantsList: number[] = []
            const syncVariantIds = new Set(pendingSyncData.map(p => p.variant_id))

            localProducts.forEach(dbProduct => {
                if (!syncVariantIds.has(dbProduct.variant_id)) {
                    deletedVariantsList.push(dbProduct.variant_id)
                    const spuId = dbProduct.shopify_product_id
                    if (!deletedProductsGrouped.has(spuId)) {
                        deletedProductsGrouped.set(spuId, [])
                    }
                    deletedProductsGrouped.get(spuId)!.push(dbProduct)
                }
            })

            // Debug: Log which variants are considered "deleted"
            if (deletedVariantsList.length > 0) {
                console.log(`🗑�?DELETED products (in DB but NOT in Shopify): ${deletedVariantsList.length} variants`)
                console.log('   Variant IDs:', deletedVariantsList)
            }

            // Create nodes for deleted products
            const deletedRows: ProductNode[] = []
            Array.from(deletedProductsGrouped.entries()).forEach(([spuId, variants]) => {
                const firstVariant = variants[0]
                // Extract base title by removing the last part (variant name) after the last ' - '
                const titleParts = firstVariant.title.split(' - ')
                const baseTitle = titleParts.length > 1 ? titleParts.slice(0, -1).join(' - ') : titleParts[0]

                const prices = variants.map(v => v.price)
                const minPrice = Math.min(...prices)
                const maxPrice = Math.max(...prices)
                const priceRange = minPrice === maxPrice
                    ? formatCurrency(minPrice)
                    : `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`

                const comparePrices = variants
                    .map(v => v.compare_at_price)
                    .filter((p): p is number => p !== null)

                let compareRange = '-'
                if (comparePrices.length > 0) {
                    const minCompare = Math.min(...comparePrices)
                    const maxCompare = Math.max(...comparePrices)
                    compareRange = minCompare === maxCompare
                        ? formatCurrency(minCompare)
                        : `${formatCurrency(minCompare)} - ${formatCurrency(maxCompare)}`
                }

                const subRows: ProductNode[] = variants.map(v => ({
                    ...v,
                    id: `variant-${v.variant_id}`,
                    is_spu: false,
                    is_deleted: true, // Mark as deleted
                    original_product: v,
                    sync_product: undefined, // No sync product for deleted items
                }))

                const node: ProductNode = {
                    id: `spu-${spuId}`,
                    is_spu: true,
                    is_deleted: true, // Mark SPU as deleted if all variants are deleted
                    shopify_product_id: spuId,
                    title: baseTitle,
                    handle: firstVariant.handle,
                    image_url: firstVariant.image_url,
                    variant_count: variants.length,
                    total_inventory: variants.reduce((sum, v) => sum + (v.internal_meta?.manual_inventory ?? v.inventory_quantity), 0),
                    price_range: priceRange,
                    compare_at_price_range: compareRange,
                    total_cost: variants.reduce((sum, v) => sum + (v.internal_meta?.cost_price || 0), 0),
                    total_profit: variants.reduce((sum, v) => {
                        const profit = calculateGrossProfit(
                            v.price,
                            v.internal_meta?.cost_price
                        )
                        return sum + (profit || 0)
                    }, 0),
                    subRows,
                    has_changes: true, // Deleted products are always marked as changed
                }
                deletedRows.push(node)
            })

            // Sort into diff/normal/new
            processedNodes.forEach(node => {
                if (node.has_changes) {
                    diffRows.push(node)
                } else {
                    normalRows.push(node)
                }
            })

            console.log('📊 Sync preview results:', {
                deletedRows: deletedRows.length,
                newRows: newRows.length,
                diffRows: diffRows.length,
                normalRows: normalRows.length,
                total: deletedRows.length + newRows.length + diffRows.length + normalRows.length
            })
            console.log('📊 Details - Deleted rows:', deletedRows.length, ', New rows:', newRows.length, ', Diff rows:', diffRows.length, ', Normal rows:', normalRows.length)

            return [...deletedRows, ...newRows, ...diffRows, ...normalRows]
        }

        return Array.from(grouped.entries()).map(([spuId, variants]) => {
            const firstVariant = variants[0]
            // Extract base title by removing the last part (variant name) after the last ' - '
            const titleParts = firstVariant.title.split(' - ')
            const baseTitle = titleParts.length > 1 ? titleParts.slice(0, -1).join(' - ') : titleParts[0]

            // 计算价格范围
            const prices = variants.map(v => v.price)
            const minPrice = Math.min(...prices)
            const maxPrice = Math.max(...prices)
            const priceRange = minPrice === maxPrice
                ? formatCurrency(minPrice)
                : `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`

            // 计算划线价范�?
            const comparePrices = variants
                .map(v => v.compare_at_price)
                .filter((p): p is number => p !== null)

            let compareRange = '-'
            if (comparePrices.length > 0) {
                const minCompare = Math.min(...comparePrices)
                const maxCompare = Math.max(...comparePrices)
                compareRange = minCompare === maxCompare
                    ? formatCurrency(minCompare)
                    : `${formatCurrency(minCompare)} - ${formatCurrency(maxCompare)}`
            }

            // 构建变体节点
            const subRows: ProductNode[] = variants.map(v => ({
                ...v, // Spread first
                id: `variant-${v.variant_id}`, // Then overwrite id
                is_spu: false,
                original_product: v,
            }))

            // 构建 SPU 节点
            return {
                id: `spu-${spuId}`,
                is_spu: true,
                shopify_product_id: spuId,
                title: baseTitle,
                handle: firstVariant.handle,
                image_url: firstVariant.image_url,
                variant_count: variants.length,
                total_inventory: variants.reduce((sum, v) => sum + (v.internal_meta?.manual_inventory ?? v.inventory_quantity), 0),
                price_range: priceRange,
                compare_at_price_range: compareRange,
                total_cost: variants.reduce((sum, v) => sum + (v.internal_meta?.cost_price || 0), 0),
                total_profit: variants.reduce((sum, v) => {
                    const profit = calculateGrossProfit(
                        v.price,
                        v.internal_meta?.cost_price
                    )
                    return sum + (profit || 0)
                }, 0),
                subRows,
            }
        })
    }, [localProducts, pendingSyncData])

    // Apply vendor filter to hierarchical data
    const filteredData = useMemo<ProductNode[]>(() => {
        // If no filter is set, return all data
        if (vendorFilter.size === 0) return data

        return data.filter(spuNode => {
            // For SPU nodes, check if any variant matches the filter
            if (spuNode.is_spu && spuNode.subRows) {
                return spuNode.subRows.some(variant => {
                    const vendor = variant.internal_meta?.vendor
                    return vendor && vendorFilter.has(vendor)
                })
            }
            // For non-SPU rows (shouldn't happen in normal display)
            const vendor = spuNode.internal_meta?.vendor
            return vendor && vendorFilter.has(vendor)
        })
    }, [data, vendorFilter])

    // 计算同步差异数量 (must be after data is defined)
    const syncDiffCount = useMemo(() => {
        if (!pendingSyncData) return 0
        return data.filter(row => row.has_changes).length
    }, [data, pendingSyncData])


    // 计算 weight 更新差异数量
    const weightDiffCount = useMemo(() => {
        if (!pendingWeightData) return 0
        return pendingWeightData.filter((p: any) => {
            const dbWeight = p.weight !== null && p.weight !== undefined ? Number(p.weight) : null
            const newWeight = p.shopify_weight !== null && p.shopify_weight !== undefined ? Number(p.shopify_weight) : null
            return dbWeight !== newWeight
        }).length
    }, [pendingWeightData])

    // 检查是否有未保存的更改
    const hasUnsavedChanges = pendingChanges.size > 0 || pendingDeletions.size > 0 || syncDiffCount > 0 || weightDiffCount > 0


    const columns = useMemo<ColumnDef<ProductNode>[]>(() => [
        ...(deleteMode ? [{
            id: 'delete',
            header: ({ table }) => {
                const rows = table.getRowModel().rows
                const selectedCount = rows.filter(row => pendingDeletions.has(row.original.id!)).length
                const allSelected = selectedCount === rows.length && rows.length > 0
                const someSelected = selectedCount > 0 && selectedCount < rows.length

                return (
                    <div className="flex items-center justify-center">
                        <Checkbox
                            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                            onCheckedChange={() => handleDeleteAllToggle(rows)}
                            aria-label="Select all"
                            className="mr-2"
                        />
                    </div>
                )
            },
            cell: ({ row }) => (
                <div className="flex items-center justify-center">
                    <button
                        onClick={() => handleDeleteToggle(row.original.id!)}
                        className="p-1 hover:bg-destructive/10 rounded group"
                    >
                        <Trash2
                            className={`h-4 w-4 ${pendingDeletions.has(row.original.id!) ? 'text-destructive' : 'text-foreground group-hover:text-destructive'}`}
                        />
                    </button>
                </div>
            ),
            enableSorting: false,
            enableHiding: false,
            enableResizing: false,
            size: 40,
        } as ColumnDef<ProductNode>] : []),
        {
            id: 'expander',
            header: () => null,
            size: 24,
            enableResizing: false,
            cell: ({ row }) => {
                if (!row.original.is_spu || (row.original.subRows?.length || 0) <= 1) return null
                return (
                    <button
                        onClick={row.getToggleExpandedHandler()}
                        className="cursor-pointer p-1 hover:bg-muted rounded"
                    >
                        {row.getIsExpanded() ? (
                            <ChevronDown className="h-4 w-4" />
                        ) : (
                            <ChevronRight className="h-4 w-4" />
                        )}
                    </button>
                )
            },
        },
        {
            id: 'image',
            header: () => <span className="text-foreground">Image*</span>,
            size: 50,
            enableResizing: false,
            cell: ({ row }) => {
                const [showPreview, setShowPreview] = React.useState(false)
                const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 })

                const handleMouseMove = (e: React.MouseEvent) => {
                    setMousePos({ x: e.clientX, y: e.clientY })
                }

                // Check for image changes
                const syncProduct = row.original.sync_product
                const hasImageChange = syncProduct && row.original.image_url !== syncProduct.image_url
                const displayImageUrl = hasImageChange ? syncProduct.image_url : row.original.image_url

                return (
                    <div
                        className="w-10 h-10 relative"
                        onMouseEnter={() => setShowPreview(true)}
                        onMouseLeave={() => setShowPreview(false)}
                        onMouseMove={handleMouseMove}
                    >
                        {displayImageUrl ? (
                            <>
                                <Image
                                    src={displayImageUrl}
                                    alt={row.original.title || ''}
                                    fill
                                    className={`object-cover rounded cursor-pointer ${hasImageChange ? 'ring-2 ring-green-600' : ''}`}
                                    sizes="40px"
                                />
                                {showPreview && (
                                    <div
                                        className="fixed z-50 pointer-events-none"
                                        style={{
                                            left: mousePos.x + 15,
                                            top: mousePos.y + 15
                                        }}
                                    >
                                        {hasImageChange ? (
                                            <div className="flex gap-2">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-xs text-green-600 font-bold">New</span>
                                                    <div className="w-48 h-48 relative bg-background border-2 border-green-600 rounded-lg shadow-xl overflow-hidden">
                                                        <Image
                                                            src={syncProduct.image_url!}
                                                            alt={row.original.title || ''}
                                                            fill
                                                            className="object-contain"
                                                            sizes="192px"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-xs text-foreground line-through">Old</span>
                                                    <div className="w-48 h-48 relative bg-background border rounded-lg shadow-xl overflow-hidden opacity-60">
                                                        <Image
                                                            src={row.original.image_url!}
                                                            alt={row.original.title || ''}
                                                            fill
                                                            className="object-contain"
                                                            sizes="192px"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="w-48 h-48 relative bg-background border rounded-lg shadow-xl overflow-hidden">
                                                <Image
                                                    src={displayImageUrl}
                                                    alt={row.original.title || ''}
                                                    fill
                                                    className="object-contain"
                                                    sizes="192px"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="w-full h-full bg-muted rounded flex items-center justify-center text-[10px]">
                                No img
                            </div>
                        )}
                    </div>
                )
            },
        },
        {
            id: 'title',
            accessorKey: 'title',
            header: () => <span className="text-foreground">Product / Variant*</span>,
            size: 350,
            cell: ({ row }) => {
                // Get landing page URL - use first variant's URL for SPU
                const getLandingUrl = () => {
                    if (row.original.is_spu) {
                        const firstVariant = row.original.subRows?.[0]
                        return firstVariant?.landing_page_url || (firstVariant?.handle ? `https://${process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN}/products/${firstVariant.handle}` : null)
                    }
                    return row.original.landing_page_url || (row.original.handle ? `https://${process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN}/products/${row.original.handle}` : null)
                }

                const landingUrl = getLandingUrl()

                if (row.original.is_spu) {
                    // Check if any subRow has title changes
                    const hasTitleChanges = row.original.has_changes && row.original.subRows?.some(v => {
                        const syncV = v.sync_product
                        return syncV && v.title !== syncV.title
                    })

                    if (hasTitleChanges && row.original.subRows) {
                        // Get the new base title from sync data
                        const firstSyncVariant = row.original.subRows[0]?.sync_product
                        if (firstSyncVariant) {
                            const syncTitleParts = firstSyncVariant.title.split(' - ')
                            const newBaseTitle = syncTitleParts.length > 1 ? syncTitleParts.slice(0, -1).join(' - ') : syncTitleParts[0]

                            return (
                                <div className="font-medium flex flex-col">
                                    <span className="text-green-600 font-bold text-xs">
                                        {landingUrl ? (
                                            <a
                                                href={landingUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="hover:text-green-700 hover:underline transition-colors"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {newBaseTitle}
                                            </a>
                                        ) : (
                                            newBaseTitle
                                        )}
                                    </span>
                                    <span className="line-through text-foreground opacity-60 text-xs">
                                        {row.original.title}
                                    </span>
                                    {row.original.variant_count && row.original.variant_count > 1 && (
                                        <span className="text-xs text-foreground font-normal">
                                            ({row.original.variant_count} variants)
                                        </span>
                                    )}
                                </div>
                            )
                        }
                    }

                    return (
                        <div className="font-medium flex items-center gap-2">
                            <div className="flex-1">
                                {landingUrl ? (
                                    <a
                                        href={landingUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`hover:text-primary hover:underline transition-colors ${row.original.is_deleted ? 'line-through text-foreground' : ''}`}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {row.original.title}
                                    </a>
                                ) : (
                                    <span className={row.original.is_deleted ? 'line-through text-foreground' : ''}>
                                        {row.original.title}
                                    </span>
                                )}
                                {row.original.variant_count && row.original.variant_count > 1 && (
                                    <span className="ml-2 text-xs text-foreground font-normal">
                                        ({row.original.variant_count} variants)
                                    </span>
                                )}
                            </div>
                            {row.original.is_deleted && (
                                <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded">
                                    DELETED
                                </span>
                            )}
                        </div>
                    )
                }

                // Variant row - extract the last part after the last ' - '
                const titleParts = row.original.title?.split(' - ') || []
                const title = titleParts.length > 1 ? titleParts[titleParts.length - 1] : 'Default'

                // Check for title changes
                const syncProduct = row.original.sync_product
                const hasTitleChange = syncProduct && row.original.title !== syncProduct.title

                if (hasTitleChange) {
                    const syncTitleParts = syncProduct.title?.split(' - ') || []
                    const newTitle = syncTitleParts.length > 1 ? syncTitleParts[syncTitleParts.length - 1] : 'Default'

                    return (
                        <div className="text-xs flex flex-col">
                            <span className="text-green-600 font-bold">
                                {landingUrl ? (
                                    <a
                                        href={landingUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:text-green-700 hover:underline transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {newTitle}
                                    </a>
                                ) : (
                                    newTitle
                                )}
                            </span>
                            <span className="line-through text-foreground opacity-60 text-xs">
                                {title}
                            </span>
                        </div>
                    )
                }

                return (
                    <div className="text-xs text-foreground flex items-center gap-2">
                        <div className="flex-1">
                            {landingUrl ? (
                                <a
                                    href={landingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`hover:text-primary hover:underline transition-colors ${row.original.is_deleted ? 'line-through' : ''}`}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {title}
                                </a>
                            ) : (
                                <span className={row.original.is_deleted ? 'line-through' : ''}>
                                    {title}
                                </span>
                            )}
                        </div>
                        {row.original.is_deleted && (
                            <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded">
                                DELETED
                            </span>
                        )}
                    </div>
                )
            },
        },
        {
            id: 'price',
            header: () => <span className="text-foreground">Price*</span>,
            size: 90,
            cell: ({ row }) => {
                const syncVariant = row.original.sync_product

                if (row.original.is_spu) {
                    // Check if any subRow has price changes
                    const hasPriceChanges = row.original.has_changes && row.original.subRows?.some(v => {
                        const syncV = v.sync_product
                        return syncV && Number(syncV.price) !== Number(v.price)
                    })

                    if (hasPriceChanges && row.original.subRows) {
                        // Calculate new price range from sync data
                        const syncPrices = row.original.subRows
                            .map(v => v.sync_product?.price)
                            .filter((p): p is number => p !== undefined)

                        if (syncPrices.length > 0) {
                            const minSyncPrice = Math.min(...syncPrices)
                            const maxSyncPrice = Math.max(...syncPrices)
                            const syncPriceRange = minSyncPrice === maxSyncPrice
                                ? formatCurrency(minSyncPrice)
                                : `${formatCurrency(minSyncPrice)} - ${formatCurrency(maxSyncPrice)}`

                            return (
                                <div className="flex flex-col font-mono">
                                    <span className="text-green-600 font-bold text-xs">{syncPriceRange}</span>
                                    <span className="line-through text-foreground opacity-60 text-xs">{row.original.price_range}</span>
                                </div>
                            )
                        }
                    }

                    return (
                        <span className="font-mono text-xs">
                            {row.original.price_range}
                        </span>
                    )
                }

                if (syncVariant && Number(syncVariant.price) !== Number(row.original.price)) {
                    return (
                        <div className="flex flex-col font-mono">
                            <span className="text-green-600 font-bold text-xs">{formatCurrency(syncVariant.price)}</span>
                            <span className="line-through text-foreground opacity-60 text-xs">{formatCurrency(row.original.price!)}</span>
                        </div>
                    )
                }

                return (
                    <span className="font-mono text-xs">
                        {formatCurrency(row.original.price!)}
                    </span>
                )
            },
        },
        {
            id: 'compare_at_price',
            header: () => <span className="text-foreground">Compare At*</span>,
            size: 90,
            cell: ({ row }) => {
                const syncVariant = row.original.sync_product

                if (row.original.is_spu) {
                    // Check if any subRow has compare_at_price changes
                    const hasCompareChanges = row.original.has_changes && row.original.subRows?.some(v => {
                        const syncV = v.sync_product
                        const syncVal = syncV?.compare_at_price !== null && syncV?.compare_at_price !== undefined ? Number(syncV.compare_at_price) : null
                        const dbVal = v.compare_at_price !== null ? Number(v.compare_at_price) : null
                        return syncV && syncVal !== dbVal
                    })

                    if (hasCompareChanges && row.original.subRows) {
                        // Calculate new compare_at_price range from sync data
                        const syncComparePrices = row.original.subRows
                            .map(v => v.sync_product?.compare_at_price)
                            .filter((p): p is number => p !== undefined && p !== null)

                        if (syncComparePrices.length > 0) {
                            const minSyncCompare = Math.min(...syncComparePrices)
                            const maxSyncCompare = Math.max(...syncComparePrices)
                            const syncCompareRange = minSyncCompare === maxSyncCompare
                                ? formatCurrency(minSyncCompare)
                                : `${formatCurrency(minSyncCompare)} - ${formatCurrency(maxSyncCompare)}`

                            return (
                                <div className="flex flex-col font-mono">
                                    <span className="text-green-600 font-bold text-xs">{syncCompareRange}</span>
                                    <span className="line-through text-foreground opacity-60 text-xs">{row.original.compare_at_price_range}</span>
                                </div>
                            )
                        }
                    }

                    return (
                        <span className="font-mono text-xs">
                            {row.original.compare_at_price_range}
                        </span>
                    )
                }

                // Compare with type coercion
                const syncCompare = syncVariant?.compare_at_price !== null && syncVariant?.compare_at_price !== undefined ? Number(syncVariant.compare_at_price) : null
                const dbCompare = row.original.compare_at_price !== null ? Number(row.original.compare_at_price) : null

                if (syncVariant && syncCompare !== dbCompare) {
                    return (
                        <div className="flex flex-col font-mono">
                            <span className="text-green-600 font-bold text-xs">
                                {syncVariant.compare_at_price ? formatCurrency(syncVariant.compare_at_price) : '-'}
                            </span>
                            <span className="line-through text-foreground opacity-60 text-xs">
                                {row.original.compare_at_price ? formatCurrency(row.original.compare_at_price) : '-'}
                            </span>
                        </div>
                    )
                }

                return (
                    <span className="font-mono text-xs">
                        {row.original.compare_at_price ? formatCurrency(row.original.compare_at_price) : '-'}
                    </span>
                )
            },
        },
        {
            id: 'inventory',
            header: () => <span className="text-foreground">Inventory</span>,
            size: 80,
            cell: ({ row }) => {
                // For SPU with multiple variants, show total inventory
                if (row.original.is_spu && (row.original.subRows?.length || 0) > 1) {
                    // Check if any subRow has inventory changes
                    const hasInventoryChanges = row.original.has_changes && row.original.subRows?.some(v => {
                        const syncV = v.sync_product
                        const currentInv = Number(v.internal_meta?.manual_inventory ?? v.inventory_quantity)
                        const syncInv = syncV ? Number(syncV.inventory_quantity) : null
                        return syncV && syncInv !== currentInv
                    })

                    if (hasInventoryChanges && row.original.subRows) {
                        // Calculate new total inventory from sync data
                        const syncTotalInventory = row.original.subRows.reduce((sum, v) => {
                            return sum + (v.sync_product?.inventory_quantity ?? 0)
                        }, 0)

                        return (
                            <div className="flex flex-col font-mono">
                                <span className="text-green-600 font-bold text-xs">{formatNumber(syncTotalInventory)}</span>
                                <span className="line-through text-foreground opacity-60 text-xs">{formatNumber(row.original.total_inventory!)}</span>
                            </div>
                        )
                    }

                    return (
                        <div className="h-8 px-2 py-1 font-mono font-medium text-xs flex items-center">
                            {formatNumber(row.original.total_inventory!)}
                        </div>
                    )
                }
                // For single variant SPU or variant row, show editable cell
                const variant = row.original.is_spu ? row.original.subRows?.[0] : row.original
                if (!variant) return <span className="text-foreground">-</span>

                const syncVariant = row.original.sync_product

                // Check if sync/live inventory is different - use Number() for consistent comparison
                const currentInventory = Number(variant.internal_meta?.manual_inventory ?? variant.inventory_quantity)
                const syncInventory = syncVariant?.inventory_quantity !== undefined ? Number(syncVariant.inventory_quantity) : undefined

                if (syncInventory !== undefined && syncInventory !== currentInventory) {
                    return (
                        <div className="flex flex-col font-mono">
                            <span className="text-green-600 font-bold text-xs">{syncInventory}</span>
                            <span className="line-through text-foreground opacity-60 text-xs">{currentInventory}</span>
                        </div>
                    )
                }

                // 格式化时间戳显示
                const updatedAt = variant.internal_meta?.inventory_updated_at
                const formatTimestamp = (isoString: string) => {
                    const date = new Date(isoString)
                    return date.toLocaleString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    })
                }
                const tooltipText = updatedAt
                    ? `上次更新: ${formatTimestamp(updatedAt)}`
                    : '库存尚未手动更新'

                return (
                    <EditableCell
                        value={currentInventory}
                        tooltip={tooltipText}
                        onCommit={(val) => handleUpdate(variant.variant_id!, 'manual_inventory', val)}
                    />
                )
            },
        },
        {
            id: 'cost_price',
            header: () => <span className="text-foreground">Cost</span>,
            size: 80,
            cell: ({ row }) => {
                // For SPU with multiple variants, show average cost
                if (row.original.is_spu && (row.original.subRows?.length || 0) > 1) {
                    const variantCount = row.original.subRows?.length || 1
                    const avgCost = (row.original.total_cost || 0) / variantCount
                    return (
                        <div className="h-8 px-2 py-1 font-mono text-xs flex items-center">
                            {formatCurrency(avgCost)}
                        </div>
                    )
                }
                // For single variant SPU or variant row, show editable cell
                const variant = row.original.is_spu ? row.original.subRows?.[0] : row.original
                if (!variant) return <span className="text-foreground">-</span>
                return (
                    <EditableCell
                        value={variant.internal_meta?.cost_price}
                        format="currency"
                        onCommit={(val) => handleUpdate(variant.variant_id!, 'cost_price', val)}
                    />
                )
            },
        },


        {
            id: 'profit',
            header: () => <span className="text-foreground">Profit</span>,
            size: 80,
            cell: ({ row }) => {
                if (row.original.is_spu && (row.original.subRows?.length || 0) > 1) {
                    // Calculate average profit across variants
                    const variantCount = row.original.subRows?.length || 1
                    const avgProfit = (row.original.total_profit || 0) / variantCount
                    return (
                        <div className="h-8 px-2 py-1 flex items-center">
                            <span className={`font-mono font-medium text-xs ${avgProfit > 0 ? 'text-green-600' : avgProfit < 0 ? 'text-red-600' : ''}`}>
                                {formatCurrency(avgProfit)}
                            </span>
                        </div>
                    )
                }

                // For single variant SPU or variant row
                const variant = row.original.is_spu ? row.original.subRows?.[0] : row.original
                if (!variant) return <span className="text-foreground">-</span>

                const profit = calculateGrossProfit(
                    variant.price!,
                    variant.internal_meta?.cost_price
                )
                return (
                    <span className={`font-mono text-xs ${profit && profit > 0 ? 'text-green-600' : profit && profit < 0 ? 'text-red-600' : ''}`}>
                        {profit !== null ? formatCurrency(profit) : '-'}
                    </span>
                )
            },
        },
        {
            id: 'notes',
            header: () => <span className="text-foreground">Notes</span>,
            size: 150,
            cell: ({ row }) => {
                // For SPU with multiple variants, show dash
                if (row.original.is_spu && (row.original.subRows?.length || 0) > 1) {
                    return <span className="text-foreground">-</span>
                }
                // For single variant SPU or variant row, show editable cell
                const variant = row.original.is_spu ? row.original.subRows?.[0] : row.original
                if (!variant) return <span className="text-foreground">-</span>
                return (
                    <EditableCell
                        value={variant.internal_meta?.notes}
                        onCommit={(val) => handleUpdate(variant.variant_id!, 'notes', val)}
                    />
                )
            },
        },

        {
            id: 'created_at',
            header: () => <span className="text-foreground">Created At*</span>,
            size: 140,
            cell: ({ row }) => {
                const variant = row.original.is_spu ? row.original.subRows?.[0] : row.original
                if (!variant || !variant.created_at) return <span className="text-foreground">-</span>

                const formatTimestamp = (isoString: string) => {
                    const date = new Date(isoString)
                    return date.toLocaleString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    })
                }

                return (
                    <span className="text-xs text-foreground">
                        {formatTimestamp(variant.created_at)}
                    </span>
                )
            },
        },
        {
            id: 'vendor',
            header: () => (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-1 text-foreground hover:text-primary focus:outline-none">
                            <span>Vendor</span>
                            <Filter className={`h-3 w-3 ${vendorFilter.size > 0 ? 'text-primary' : ''}`} />
                            {vendorFilter.size > 0 && (
                                <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                                    {vendorFilter.size}
                                </span>
                            )}
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-[300px] overflow-y-auto">
                        <DropdownMenuCheckboxItem
                            checked={vendorFilter.size === 0}
                            onCheckedChange={() => setVendorFilter(new Set())}
                        >
                            All Vendors
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuSeparator />
                        {uniqueVendors.map(vendor => (
                            <DropdownMenuCheckboxItem
                                key={vendor}
                                checked={vendorFilter.has(vendor)}
                                onCheckedChange={(checked) => {
                                    setVendorFilter(prev => {
                                        const next = new Set(prev)
                                        if (checked) {
                                            next.add(vendor)
                                        } else {
                                            next.delete(vendor)
                                        }
                                        return next
                                    })
                                }}
                            >
                                {vendor}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
            size: 120,
            cell: ({ row }) => {
                if (row.original.is_spu && (row.original.subRows?.length || 0) > 1) {
                    // SPU row editing (Mass update)
                    // Get common value if all are same, else show placeholder or mixed
                    const subRows = row.original.subRows || []
                    const firstVal = subRows[0]?.internal_meta?.vendor
                    const allSame = subRows.every(v => v.internal_meta?.vendor === firstVal)
                    const displayValue = allSame ? firstVal : '' // If mixed, show empty? Or show first? User said "allow modification"

                    return (
                        <EditableCell
                            value={displayValue}
                            tooltip={allSame ? "Edit Vendor for all variants" : "Mixed Vendors - Edit to overwrite all"}
                            onCommit={(val) => handleSPUUpdate(row.original.shopify_product_id!, 'vendor', val)}
                            className={!allSame ? "italic placeholder:text-muted-foreground" : ""}
                        />
                    )
                }
                const variant = row.original.is_spu ? row.original.subRows?.[0] : row.original
                if (!variant) return <span className="text-foreground">-</span>
                return (
                    <EditableCell
                        value={variant.internal_meta?.vendor}
                        onCommit={(val) => handleUpdate(variant.variant_id!, 'vendor', val)}
                    />
                )
            },
        },

        {
            id: 'purchase_link',
            header: () => <span className="text-foreground">Purchase Link</span>,
            size: 150,
            cell: ({ row }) => {
                if (row.original.is_spu && (row.original.subRows?.length || 0) > 1) {
                    // SPU row editing (Mass update)
                    const subRows = row.original.subRows || []
                    const firstVal = subRows[0]?.internal_meta?.purchase_link
                    const allSame = subRows.every(v => v.internal_meta?.purchase_link === firstVal)
                    const displayValue = allSame ? firstVal : ''

                    return (
                        <EditableCell
                            value={displayValue}
                            tooltip={allSame ? "Edit Link for all variants" : "Mixed Links - Edit to overwrite all"}
                            onCommit={(val) => handleSPUUpdate(row.original.shopify_product_id!, 'purchase_link', val)}
                            className={!allSame ? "italic placeholder:text-muted-foreground" : ""}
                        />
                    )
                }
                const variant = row.original.is_spu ? row.original.subRows?.[0] : row.original
                if (!variant) return <span className="text-foreground">-</span>

                return (
                    <EditableCell
                        value={variant.internal_meta?.purchase_link}
                        onCommit={(val) => handleUpdate(variant.variant_id!, 'purchase_link', val)}
                    />
                )
            },
        },
        {
            id: 'weight',
            header: () => <span className="text-foreground">Weight(g)*</span>,
            size: 80,
            cell: ({ row }) => {
                const variant = row.original.is_spu ? row.original.subRows?.[0] : row.original
                if (!variant) return <span className="text-foreground">-</span>

                const dbWeight = variant.weight !== null ? Number(variant.weight) : null

                if (pendingWeightData) {
                    const weightData = pendingWeightData.find((p: any) => p.variant_id === variant.variant_id)
                    const newWeight = weightData?.shopify_weight !== null && weightData?.shopify_weight !== undefined
                        ? Number(weightData.shopify_weight)
                        : null

                    if (newWeight !== null && newWeight !== dbWeight) {
                        return (
                            <div className="bg-green-100 px-2 py-1 rounded">
                                <span className="font-mono font-bold text-xs text-green-700">
                                    {formatNumber(newWeight)}g
                                </span>
                            </div>
                        )
                    }
                }

                return (
                    <span className="font-mono text-xs text-foreground">
                        {dbWeight !== null ? `${formatNumber(dbWeight)}g` : '-'}
                    </span>
                )
            },
        },
    ], [deleteMode, pendingDeletions, handleDeleteToggle, handleDeleteAllToggle, handleUpdate, pendingWeightData, vendorFilter, uniqueVendors])

    // Fixed columns that should always be at the beginning in fixed order
    const FIXED_COLUMNS = ['delete', 'expander', 'image', 'title']

    // Sync columnOrder with actual columns - ensure fixed columns are always at the beginning
    useEffect(() => {
        const columnIds = columns.map(c => c.id || '').filter(id => id)

        // Separate fixed and movable columns from current columns
        const fixedCols = FIXED_COLUMNS.filter(id => columnIds.includes(id))
        const movableCols = columnIds.filter(id => !FIXED_COLUMNS.includes(id))

        // Read saved movable order from localStorage
        let savedMovable: string[] = []
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('inventory-column-order')
                if (saved) savedMovable = JSON.parse(saved)
            } catch { }
        }

        // Use saved order for movable columns, filter to only existing columns
        const orderedMovable = savedMovable.filter(id => movableCols.includes(id))
        const missingMovable = movableCols.filter(id => !orderedMovable.includes(id))

        // Build final order: fixed columns first (in fixed order), then movable
        const finalOrder = [
            ...fixedCols,
            ...orderedMovable,
            ...missingMovable
        ]

        setColumnOrder(finalOrder)
    }, [columns])

    const table = useReactTable({
        data: filteredData,
        columns,
        state: {
            sorting,
            columnFilters,
            globalFilter,
            expanded,
            columnSizing,
            columnOrder,
        },
        initialState: {
            pagination: {
                pageSize: 1000, // Show all (effectively)
            },
        },
        enableColumnResizing: true,
        columnResizeMode: 'onChange',
        getSubRows: row => row.subRows,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getExpandedRowModel: getExpandedRowModel(),
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onGlobalFilterChange: setGlobalFilter,
        onExpandedChange: setExpanded,
        onColumnSizingChange: setColumnSizing,
        onColumnOrderChange: setColumnOrder,
    })

    return (
        <div className="space-y-2">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex-1 flex items-center gap-2">
                    <Search className="h-4 w-4 text-foreground" />
                    <Input
                        placeholder="Search products..."
                        value={globalFilter ?? ''}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="max-w-sm"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant={deleteMode ? "destructive" : "outline"}
                        size="sm"
                        onClick={() => {
                            if (deleteMode) {
                                setPendingDeletions(new Set())
                            }
                            setDeleteMode(!deleteMode)
                        }}
                        disabled={isSaving}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {deleteMode ? 'Cancel Delete' : 'Delete'}
                    </Button>


                    {showDiscardConfirm ? (
                        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-md px-3 py-1">
                            <span className="text-sm text-destructive">Discard changes?</span>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                    setLocalProducts(products)
                                    setPendingChanges(new Map())
                                    setPendingDeletions(new Set())
                                    setDeleteMode(false)
                                    setShowDiscardConfirm(false)
                                    onDiscardSync?.() // Exit sync preview mode
                                    onDiscardWeight?.() // Exit weight preview mode
                                }}
                            >
                                Confirm
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowDiscardConfirm(false)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowDiscardConfirm(true)}
                            disabled={(!hasUnsavedChanges && !pendingSyncData && !pendingWeightData) || isSaving || isSyncing || isUpdatingWeight}
                        >
                            <Undo2 className="mr-2 h-4 w-4" />
                            Discard
                        </Button>
                    )}
                    <Button
                        variant={hasUnsavedChanges ? "default" : "outline"}
                        size="sm"
                        onClick={handleSave}
                        disabled={!hasUnsavedChanges || isSaving || isSyncing || isUpdatingWeight}
                    >
                        <Save className={`mr-2 h-4 w-4 ${(isSaving || isSyncing) ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Syncing...' : isSaving ? 'Saving...' : isUpdatingWeight ? 'Updating...' : hasUnsavedChanges
                            ? `Save (${pendingChanges.size + pendingDeletions.size + syncDiffCount + weightDiffCount})`
                            : 'Saved'}
                    </Button>
                    <ColumnVisibility columns={table.getAllColumns()} />
                </div>
            </div>

            {/* Data Table */}
            <div className="border rounded-md">
                <div className="max-h-[calc(100vh-12rem)] overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-background border-b z-10 shadow-sm">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => {
                                        const isFixedColumn = ['delete', 'expander', 'image', 'title'].includes(header.column.id)
                                        const isDragging = draggedColumn === header.column.id
                                        const allColumnIds = table.getAllLeafColumns().map(c => c.id)

                                        return (
                                            <th
                                                key={header.id}
                                                draggable={!isFixedColumn && !header.isPlaceholder}
                                                onDragStart={(e) => !isFixedColumn && handleDragStart(e, header.column.id)}
                                                onDragOver={handleDragOver}
                                                onDrop={(e) => !isFixedColumn && handleDrop(e, header.column.id, allColumnIds)}
                                                onDragEnd={handleDragEnd}
                                                className={`px-4 py-3 text-left font-medium text-foreground bg-background whitespace-nowrap relative transition-opacity ${isDragging ? 'opacity-50' : ''
                                                    } ${!isFixedColumn && !header.isPlaceholder ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                                style={{ width: header.getSize() }}
                                            >
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}
                                                {header.column.getCanResize() && (
                                                    <div
                                                        onMouseDown={header.getResizeHandler()}
                                                        onTouchStart={header.getResizeHandler()}
                                                        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none ${header.column.getIsResizing()
                                                            ? 'bg-primary'
                                                            : 'bg-muted-foreground/50 hover:bg-primary'
                                                            }`}
                                                    />
                                                )}
                                            </th>
                                        )
                                    })}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <tr
                                        key={row.id}
                                        onDoubleClick={() => {
                                            // Toggle expand/collapse on double-click for SPU rows with multiple variants
                                            if (row.original.is_spu && (row.original.subRows?.length || 0) > 1) {
                                                row.toggleExpanded()
                                            }
                                        }}
                                        className={`
                      border-b transition-colors
                      ${row.original.is_deleted ? 'bg-red-50/50 hover:bg-red-100/50 opacity-70' : ''}
                      ${pendingDeletions.has(row.original.id!) ? 'bg-red-50 hover:bg-red-100 line-through' : ''}
                      ${!row.original.is_deleted && !pendingDeletions.has(row.original.id!) && (row.original.has_changes ? 'bg-green-50' : row.original.is_spu ? 'bg-background hover:bg-muted/50' : 'bg-muted/10 hover:bg-muted/30')}
                      ${!row.original.is_deleted && !pendingDeletions.has(row.original.id!) && (row.original.has_changes ? 'hover:bg-green-100' : row.original.is_spu ? 'hover:bg-muted/50' : 'hover:bg-muted/30')}
                      font-medium
                    `}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <td key={cell.id} className="px-4 py-2 align-middle">
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={columns.length} className="h-24 text-center">
                                        No products found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination (Simplified since we show mostly all) */}
            <div className="flex items-center justify-between">
                <div className="text-sm text-foreground">
                    Showing {data.length} SPUs
                </div>
                {table.getPageCount() > 1 && (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                        >
                            Previous
                        </Button>
                        <div className="text-sm">
                            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                        >
                            Next
                        </Button>
                    </div>
                )}
            </div>

            <Dialog open={overwriteDialog.isOpen} onOpenChange={(open) => !open && setOverwriteDialog(prev => ({ ...prev, isOpen: false }))}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Data Conflict Detected</DialogTitle>
                        <DialogDescription>
                            You are updating {overwriteDialog.conflictingCount} out of {overwriteDialog.totalCount} variants that already have data.
                            <br />
                            Do you want to overwrite all existing values or only fill empty ones?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button
                            variant="secondary"
                            onClick={() => applySPUUpdate(overwriteDialog.spuId, overwriteDialog.field, overwriteDialog.value, 'fill-empty')}
                        >
                            Keep Existing (Fill Empty)
                        </Button>
                        <Button
                            variant="default"
                            onClick={() => applySPUUpdate(overwriteDialog.spuId, overwriteDialog.field, overwriteDialog.value, 'overwrite')}
                        >
                            Overwrite All
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}








