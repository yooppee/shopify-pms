'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { InventoryTable } from '@/components/inventory/inventory-table'
import { TrackingDialog } from '@/components/inventory/tracking-dialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Layers, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import React, { useState, useMemo } from 'react'
import { ProductWithCalculations } from '@/lib/supabase/types'

async function fetchProducts() {
    const response = await fetch('/api/products')
    if (!response.ok) throw new Error('Failed to fetch products')
    const data = await response.json()
    return data.products || []
}

export default function InventoryPage() {
    const queryClient = useQueryClient()
    const [isTrackingOpen, setIsTrackingOpen] = useState(false)

    const { data: allProducts = [], isLoading, error, refetch } = useQuery({
        queryKey: ['products'],
        queryFn: fetchProducts,
    })

    // 过滤出被追踪的产品 (SPU 维度)
    const trackedProducts = useMemo(() => {
        return allProducts.filter((p: ProductWithCalculations) => p.internal_meta?.is_tracked_inventory)
    }, [allProducts])

    // 为选择框提取所有可选 SPU (去重)
    const availableSPUs = useMemo(() => {
        const spuMap = new Map<number, { shopify_product_id: number, title: string, image_url: string | null, handle: string, is_tracked: boolean }>()

        allProducts.forEach((p: ProductWithCalculations) => {
            const spuId = p.shopify_product_id
            const isCustom = !!p.internal_meta?.custom_variant

            const frozenTitle = p.internal_meta?.spu_title

            if (!spuMap.has(spuId)) {
                // 提取 SPU 基础标题 (去掉变体部分)
                const titleParts = p.title.split(' - ')
                const derivedTitle = titleParts.length > 1 ? titleParts.slice(0, -1).join(' - ') : titleParts[0]

                spuMap.set(spuId, {
                    shopify_product_id: spuId,
                    title: frozenTitle || derivedTitle,
                    image_url: p.image_url,
                    handle: p.handle,
                    is_tracked: !!p.internal_meta?.is_tracked_inventory,
                    isFrozen: !!frozenTitle,
                    isFromStandard: !isCustom
                } as any)
            } else {
                const existing = spuMap.get(spuId) as any
                if (frozenTitle) {
                    existing.title = frozenTitle
                    existing.isFrozen = true
                } else if (!existing.isFrozen && !isCustom && !existing.isFromStandard) {
                    const titleParts = p.title.split(' - ')
                    existing.title = titleParts.length > 1 ? titleParts.slice(0, -1).join(' - ') : titleParts[0]
                    existing.isFromStandard = true
                }

                if (!existing.image_url || (!isCustom && p.image_url)) {
                    existing.image_url = p.image_url
                }
            }
        })
        return Array.from(spuMap.values()).map(({ isFrozen, isFromStandard, ...rest }: any) => rest)
    }, [allProducts])

    return (
        <div className="flex h-screen">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden bg-[#f8f9fa]">
                <main className="flex-1 overflow-auto">
                    <div className="p-8 max-w-screen-2xl mx-auto">
                        {/* Header */}
                        <div className="flex items-end justify-between mb-8">
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Active Inventory</h1>
                                <p className="text-slate-500 mt-2 font-medium">
                                    Manual stock tracking for selected products.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    className="border-slate-200 bg-white"
                                    onClick={() => queryClient.invalidateQueries({ queryKey: ['products'] })}
                                >
                                    <RefreshCw className={isLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                                </Button>
                                <Button
                                    onClick={() => setIsTrackingOpen(true)}
                                    className="bg-black text-white hover:bg-black/90 px-6"
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Track SPU
                                </Button>
                            </div>
                        </div>

                        {/* Content Area */}
                        {trackedProducts.length > 0 ? (
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
                                <InventoryTable
                                    products={trackedProducts}
                                    allProducts={allProducts}
                                    onRefresh={refetch}
                                />
                            </div>
                        ) : (
                            <div className="mt-12 flex flex-col items-center justify-center p-16 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                                <div className="h-16 w-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                                    <Layers className="h-8 w-8 text-slate-300" />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-900">No Tracked Products</h3>
                                <p className="text-slate-500 text-center max-w-sm mt-1">
                                    Select specific SPU products from your catalog to start recording physical inventory.
                                </p>
                                <Button
                                    variant="outline"
                                    onClick={() => setIsTrackingOpen(true)}
                                    className="mt-6 bg-white"
                                >
                                    Select Products to Record
                                </Button>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* Selection Dialog */}
            <TrackingDialog
                open={isTrackingOpen}
                onOpenChange={setIsTrackingOpen}
                availableSPUs={availableSPUs}
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ['products'] })}
            />
        </div>
    )
}
