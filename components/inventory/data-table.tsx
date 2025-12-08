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
} from '@tanstack/react-table'
import { ProductWithCalculations } from '@/lib/supabase/types'
import { formatCurrency, formatNumber, calculateGrossProfit } from '@/lib/utils'
import { EditableCell } from './editable-cell'
import { ColumnVisibility } from './column-visibility'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RefreshCw, Search, ChevronRight, ChevronDown, Save, Undo2, X, Trash2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import Image from 'next/image'
import { supabaseUntyped } from '@/lib/supabase/client'
import { DiffCell } from './sync-indicator'

// 扩展类型以支持层级结构
interface ProductNode extends Partial<ProductWithCalculations> {
    id: string // Unique ID for table (SPU ID or Variant ID)
    is_spu: boolean
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
    onSaveSync?: () => void
    onDiscardSync?: () => void
    isSyncing?: boolean // New prop to indicate sync in progress
    onRefresh?: () => void // Callback to refresh parent data
}

export function InventoryDataTable({
    products,
    pendingSyncData,
    onSaveSync,
    onDiscardSync,
    isSyncing = false,
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

    // Debug: Log when pendingSyncData changes
    useEffect(() => {
        console.log('🎯 pendingSyncData prop changed:', pendingSyncData?.length, 'products')
    }, [pendingSyncData])

    // 更新本地产品数据
    useEffect(() => {
        setLocalProducts(products)
        // 清空待保存的更改（数据已刷新）
        setPendingChanges(new Map())
    }, [products])

    // 检查是否有未保存的更改
    const hasUnsavedChanges = pendingChanges.size > 0 || pendingDeletions.size > 0 || !!pendingSyncData

    // 处理内部元数据更新 - 只更新本地状态并记录待保存的更改
    const handleUpdate = useCallback((variantId: number, field: string, value: any) => {
        const now = new Date().toISOString()

        // 更新本地产品数据
        setLocalProducts(prev => prev.map(product => {
            if (product.variant_id === variantId) {
                const updatedMeta: Record<string, any> = {
                    ...product.internal_meta,
                    [field]: value
                }
                // 如果是库存字段，同时更新时间戳
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
            // 如果是库存字段，同时记录时间戳更改
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

    // 批量保存所有待保存的更改
    const handleSave = async () => {
        console.log('💾 handleSave called with:', {
            pendingChanges: pendingChanges.size,
            pendingDeletions: pendingDeletions.size,
            hasPendingSyncData: !!pendingSyncData,
            pendingSyncDataCount: pendingSyncData?.length
        })

        if (pendingChanges.size === 0 && pendingDeletions.size === 0 && !pendingSyncData) {
            console.log('⏭️ No changes to save, returning early')
            return
        }

        setIsSaving(true)

        try {
            // First, save any pending local changes (cost, supplier, notes, inventory edits)
            if (pendingChanges.size > 0) {
                // 按 variantId 分组更改
                const changesByVariant = new Map<number, Record<string, any>>()

                pendingChanges.forEach(change => {
                    if (!changesByVariant.has(change.variantId)) {
                        changesByVariant.set(change.variantId, {})
                    }
                    changesByVariant.get(change.variantId)![change.field] = change.value
                })

                // 对每个 variant 执行更新
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

                    // 更新数据库
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
                console.log('🗑️ Processing deletions...')
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

            // If we reach here, only local changes were saved
            setIsSaving(false)
        } catch (error) {
            console.error('Failed to save changes:', error)
            alert('保存失败，请重试')
            setIsSaving(false)
        }
    }

    // 处理删除行
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

    // 处理全选删除
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
                    // 如果是SPU，找到对应的variants (需要从 localProducts 中查找)
                    const spuId = parseInt(id.replace('spu-', ''))
                    const variants = localProducts.filter(p => p.shopify_product_id === spuId)
                    variants.forEach(v => variantIdsToDelete.push(v.variant_id))
                }
            })

            console.log('🗑️ Delete requested for IDs:', pendingDeletions)
            console.log('🗑️ Variant IDs to delete:', variantIdsToDelete)

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
            console.log('🗑️ Delete result:', result)

            if (!response.ok || !result.success) {
                console.error('❌ Delete API failed:', result)
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

        // 如果有同步预览数据，进行对比 merge 和排序
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
                const baseTitle = firstVariant.title.split(' - ')[0]

                // 计算价格范围
                const prices = variants.map(v => v.price)
                const minPrice = Math.min(...prices)
                const maxPrice = Math.max(...prices)
                const priceRange = minPrice === maxPrice
                    ? formatCurrency(minPrice)
                    : `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`

                // 计算划线价范围
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

                    // Debug: Log type info for first few comparisons
                    if (syncVariant) {
                        const priceDiff = syncPrice !== dbPrice
                        const invDiff = syncInventory !== dbInventory
                        const compareDiff = syncCompareAt !== dbCompareAt

                        if (priceDiff || invDiff || compareDiff) {
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
                                }
                            })
                        }
                    }

                    const isDiff = syncVariant && (
                        syncPrice !== dbPrice ||
                        syncInventory !== dbInventory ||
                        syncCompareAt !== dbCompareAt
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
                const baseTitle = firstVariant.title.split(' - ')[0]

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

            // Sort into diff/normal/new
            processedNodes.forEach(node => {
                if (node.has_changes) {
                    diffRows.push(node)
                } else {
                    normalRows.push(node)
                }
            })

            console.log('📊 Sync preview results:', {
                newRows: newRows.length,
                diffRows: diffRows.length,
                normalRows: normalRows.length,
                total: newRows.length + diffRows.length + normalRows.length
            })
            console.log('📊 Details - New rows:', newRows.length, ', Diff rows:', diffRows.length, ', Normal rows:', normalRows.length)

            return [...newRows, ...diffRows, ...normalRows]
        }

        return Array.from(grouped.entries()).map(([spuId, variants]) => {
            const firstVariant = variants[0]
            const baseTitle = firstVariant.title.split(' - ')[0]

            // 计算价格范围
            const prices = variants.map(v => v.price)
            const minPrice = Math.min(...prices)
            const maxPrice = Math.max(...prices)
            const priceRange = minPrice === maxPrice
                ? formatCurrency(minPrice)
                : `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`

            // 计算划线价范围
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

    const columns = useMemo<ColumnDef<ProductNode>[]>(() => [
        ...(deleteMode ? [{
            id: 'select',
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
                            className={`h-4 w-4 ${pendingDeletions.has(row.original.id!) ? 'text-destructive' : 'text-muted-foreground group-hover:text-destructive'}`}
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
            header: () => <span className="text-foreground">Image</span>,
            size: 50,
            enableResizing: false,
            cell: ({ row }) => {
                const [showPreview, setShowPreview] = React.useState(false)
                const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 })

                const handleMouseMove = (e: React.MouseEvent) => {
                    setMousePos({ x: e.clientX, y: e.clientY })
                }

                return (
                    <div
                        className="w-10 h-10 relative"
                        onMouseEnter={() => setShowPreview(true)}
                        onMouseLeave={() => setShowPreview(false)}
                        onMouseMove={handleMouseMove}
                    >
                        {row.original.image_url ? (
                            <>
                                <Image
                                    src={row.original.image_url}
                                    alt={row.original.title || ''}
                                    fill
                                    className="object-cover rounded cursor-pointer"
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
                                        <div className="w-48 h-48 relative bg-background border rounded-lg shadow-xl overflow-hidden">
                                            <Image
                                                src={row.original.image_url}
                                                alt={row.original.title || ''}
                                                fill
                                                className="object-contain"
                                                sizes="192px"
                                            />
                                        </div>
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
            accessorKey: 'title',
            header: () => <span className="text-foreground">Product / Variant</span>,
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
                    return (
                        <div className="font-medium">
                            {landingUrl ? (
                                <a
                                    href={landingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-primary hover:underline transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {row.original.title}
                                </a>
                            ) : (
                                row.original.title
                            )}
                            {row.original.variant_count && row.original.variant_count > 1 && (
                                <span className="ml-2 text-xs text-muted-foreground font-normal">
                                    ({row.original.variant_count} variants)
                                </span>
                            )}
                        </div>
                    )
                }
                // Variant row
                const title = row.original.title?.split(' - ')[1] || 'Default'
                return (
                    <div className="text-sm text-muted-foreground">
                        {landingUrl ? (
                            <a
                                href={landingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-primary hover:underline transition-colors"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {title}
                            </a>
                        ) : (
                            title
                        )}
                    </div>
                )
            },
        },
        {
            id: 'price',
            header: () => <span className="text-foreground">Price</span>,
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
                                    <span className="text-green-600 font-bold text-sm">{syncPriceRange}</span>
                                    <span className="line-through text-muted-foreground opacity-60 text-xs">{row.original.price_range}</span>
                                </div>
                            )
                        }
                    }

                    return (
                        <span className="font-mono text-sm">
                            {row.original.price_range}
                        </span>
                    )
                }

                if (syncVariant && Number(syncVariant.price) !== Number(row.original.price)) {
                    return (
                        <div className="flex flex-col font-mono">
                            <span className="text-green-600 font-bold text-sm">{formatCurrency(syncVariant.price)}</span>
                            <span className="line-through text-muted-foreground opacity-60 text-xs">{formatCurrency(row.original.price!)}</span>
                        </div>
                    )
                }

                return (
                    <span className="font-mono text-sm">
                        {formatCurrency(row.original.price!)}
                    </span>
                )
            },
        },
        {
            id: 'compare_at_price',
            header: 'Compare At',
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
                                    <span className="text-green-600 font-bold text-sm">{syncCompareRange}</span>
                                    <span className="line-through text-muted-foreground opacity-60 text-xs">{row.original.compare_at_price_range}</span>
                                </div>
                            )
                        }
                    }

                    return (
                        <span className="font-mono text-sm">
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
                            <span className="text-green-600 font-bold text-sm">
                                {syncVariant.compare_at_price ? formatCurrency(syncVariant.compare_at_price) : '-'}
                            </span>
                            <span className="line-through text-muted-foreground opacity-60 text-xs">
                                {row.original.compare_at_price ? formatCurrency(row.original.compare_at_price) : '-'}
                            </span>
                        </div>
                    )
                }

                return (
                    <span className="font-mono text-sm">
                        {row.original.compare_at_price ? formatCurrency(row.original.compare_at_price) : '-'}
                    </span>
                )
            },
        },
        {
            id: 'inventory',
            header: () => <span className="text-muted-foreground">Inventory</span>,
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
                                <span className="text-green-600 font-bold text-sm">{formatNumber(syncTotalInventory)}</span>
                                <span className="line-through text-muted-foreground opacity-60 text-xs">{formatNumber(row.original.total_inventory!)}</span>
                            </div>
                        )
                    }

                    return (
                        <div className="h-8 px-2 py-1 font-mono font-medium flex items-center">
                            {formatNumber(row.original.total_inventory!)}
                        </div>
                    )
                }
                // For single variant SPU or variant row, show editable cell
                const variant = row.original.is_spu ? row.original.subRows?.[0] : row.original
                if (!variant) return <span className="text-muted-foreground">-</span>

                const syncVariant = row.original.sync_product

                // Check if sync/live inventory is different - use Number() for consistent comparison
                const currentInventory = Number(variant.internal_meta?.manual_inventory ?? variant.inventory_quantity)
                const syncInventory = syncVariant?.inventory_quantity !== undefined ? Number(syncVariant.inventory_quantity) : undefined

                if (syncInventory !== undefined && syncInventory !== currentInventory) {
                    return (
                        <div className="flex flex-col font-mono">
                            <span className="text-green-600 font-bold text-sm">{syncInventory}</span>
                            <span className="line-through text-muted-foreground opacity-60 text-xs">{currentInventory}</span>
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
                    <div title={tooltipText}>
                        <EditableCell
                            productId={variant.id!}
                            variantId={variant.variant_id!}
                            field="manual_inventory"
                            value={currentInventory}
                            onUpdate={handleUpdate}
                        />
                    </div>
                )
            },
        },
        {
            id: 'cost_price',
            header: () => <span className="text-muted-foreground">Cost</span>,
            size: 80,
            cell: ({ row }) => {
                // For SPU with multiple variants, show average cost
                if (row.original.is_spu && (row.original.subRows?.length || 0) > 1) {
                    const variantCount = row.original.subRows?.length || 1
                    const avgCost = (row.original.total_cost || 0) / variantCount
                    return (
                        <div className="h-8 px-2 py-1 font-mono flex items-center">
                            {formatCurrency(avgCost)}
                        </div>
                    )
                }
                // For single variant SPU or variant row, show editable cell
                const variant = row.original.is_spu ? row.original.subRows?.[0] : row.original
                if (!variant) return <span className="text-muted-foreground">-</span>
                return (
                    <EditableCell
                        productId={variant.id!}
                        variantId={variant.variant_id!}
                        field="cost_price"
                        value={variant.internal_meta?.cost_price}
                        format="currency"
                        onUpdate={handleUpdate}
                    />
                )
            },
        },

        {
            id: 'supplier',
            header: () => <span className="text-muted-foreground">Supplier</span>,
            size: 120,
            cell: ({ row }) => {
                // For SPU with multiple variants, show dash
                if (row.original.is_spu && (row.original.subRows?.length || 0) > 1) {
                    return <span className="text-muted-foreground">-</span>
                }
                // For single variant SPU or variant row, show editable cell
                const variant = row.original.is_spu ? row.original.subRows?.[0] : row.original
                if (!variant) return <span className="text-muted-foreground">-</span>
                return (
                    <EditableCell
                        productId={variant.id!}
                        variantId={variant.variant_id!}
                        field="supplier"
                        value={variant.internal_meta?.supplier}
                        onUpdate={handleUpdate}
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
                            <span className={`font-mono font-medium ${avgProfit > 0 ? 'text-green-600' : avgProfit < 0 ? 'text-red-600' : ''}`}>
                                {formatCurrency(avgProfit)}
                            </span>
                        </div>
                    )
                }

                // For single variant SPU or variant row
                const variant = row.original.is_spu ? row.original.subRows?.[0] : row.original
                if (!variant) return <span className="text-muted-foreground">-</span>

                const profit = calculateGrossProfit(
                    variant.price!,
                    variant.internal_meta?.cost_price
                )
                return (
                    <span className={`font-mono text-sm ${profit && profit > 0 ? 'text-green-600' : profit && profit < 0 ? 'text-red-600' : ''}`}>
                        {profit !== null ? formatCurrency(profit) : '-'}
                    </span>
                )
            },
        },
        {
            id: 'notes',
            header: () => <span className="text-muted-foreground">Notes</span>,
            size: 150,
            cell: ({ row }) => {
                // For SPU with multiple variants, show dash
                if (row.original.is_spu && (row.original.subRows?.length || 0) > 1) {
                    return <span className="text-muted-foreground">-</span>
                }
                // For single variant SPU or variant row, show editable cell
                const variant = row.original.is_spu ? row.original.subRows?.[0] : row.original
                if (!variant) return <span className="text-muted-foreground">-</span>
                return (
                    <EditableCell
                        productId={variant.id!}
                        variantId={variant.variant_id!}
                        field="notes"
                        value={variant.internal_meta?.notes}
                        onUpdate={handleUpdate}
                    />
                )
            },
        },
    ], [deleteMode, pendingDeletions, handleDeleteToggle, handleDeleteAllToggle, handleUpdate])

    const table = useReactTable({
        data,
        columns,
        state: {
            sorting,
            columnFilters,
            globalFilter,
            expanded,
            columnSizing,
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
    })

    return (
        <div className="space-y-2">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex-1 flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
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
                            disabled={!hasUnsavedChanges || isSaving || isSyncing}
                        >
                            <Undo2 className="mr-2 h-4 w-4" />
                            Discard
                        </Button>
                    )}
                    <Button
                        variant={hasUnsavedChanges ? "default" : "outline"}
                        size="sm"
                        onClick={handleSave}
                        disabled={!hasUnsavedChanges || isSaving || isSyncing}
                    >
                        <Save className={`mr-2 h-4 w-4 ${(isSaving || isSyncing) ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Syncing...' : isSaving ? 'Saving...' : hasUnsavedChanges
                            ? `Save (${pendingChanges.size + pendingDeletions.size + (pendingSyncData ? 1 : 0)})`
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
                                    {headerGroup.headers.map((header) => (
                                        <th
                                            key={header.id}
                                            className="px-4 py-3 text-left font-medium text-muted-foreground bg-background whitespace-nowrap relative"
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
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <tr
                                        key={row.id}
                                        className={`
                      border-b transition-colors
                      ${pendingDeletions.has(row.original.id!) ? 'bg-red-50 hover:bg-red-100 line-through' : ''}
                      ${!pendingDeletions.has(row.original.id!) && (row.original.has_changes ? 'bg-green-50' : row.original.is_spu ? 'bg-background hover:bg-muted/50' : 'bg-muted/10 hover:bg-muted/30')}
                      ${!pendingDeletions.has(row.original.id!) && (row.original.has_changes ? 'hover:bg-green-100' : row.original.is_spu ? 'hover:bg-muted/50' : 'hover:bg-muted/30')}
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
                <div className="text-sm text-muted-foreground">
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
        </div>
    )
}
