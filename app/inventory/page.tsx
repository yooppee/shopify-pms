'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { InventoryDataTable } from '@/components/inventory/data-table'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

async function fetchProducts() {
    const response = await fetch('/api/products')  // Changed: fetch from database
    if (!response.ok) throw new Error('Failed to fetch products')
    const data = await response.json()
    return data.products || []
}

async function fetchShopifyData() {
    const response = await fetch('/api/sync')  // Fetch live Shopify data
    if (!response.ok) throw new Error('Failed to fetch Shopify data')
    const data = await response.json()
    return data.products || []
}

async function syncProducts() {
    const response = await fetch('/api/sync', { method: 'POST' })
    if (!response.ok) throw new Error('Failed to sync products')
    return response.json()
}

export default function InventoryPage() {
    const queryClient = useQueryClient()
    const [pendingSyncData, setPendingSyncData] = useState<any[] | undefined>(undefined)
    const [isLoadingPreview, setIsLoadingPreview] = useState(false)

    const { data: products = [], isLoading, error } = useQuery({
        queryKey: ['products'],
        queryFn: fetchProducts,  // Fetch from database
    })


    const syncMutation = useMutation({
        mutationFn: syncProducts,
        onSuccess: async (data) => {
            console.log('✅ Sync POST successful, response:', data)

            // Clear sync preview state
            setPendingSyncData(undefined)

            // Invalidate and refetch products query to update UI without page reload
            console.log('🔄 Invalidating products query to refresh data...')
            await queryClient.invalidateQueries({ queryKey: ['products'] })
        },
        onError: (error) => {
            console.error('❌ Sync POST failed:', error)
        },
    })

    // Fetch live data for preview (without saving)
    const handleSyncPreview = async () => {
        console.log('🔄 handleSyncPreview called')
        setIsLoadingPreview(true)
        try {
            console.log('📡 Fetching Shopify live data...')
            const liveData = await fetchShopifyData()  // Changed: use fetchShopifyData
            console.log('✅ Shopify data fetched:', liveData?.length, 'products')
            setPendingSyncData(liveData)
            console.log('✅ pendingSyncData set')
        } catch (error) {
            console.error('❌ Failed to fetch Shopify data:', error)
        } finally {
            setIsLoadingPreview(false)
            console.log('🏁 handleSyncPreview finished')
        }
    }

    // Save synced data to database
    const handleSaveSync = () => {
        console.log('💾 handleSaveSync called, triggering POST /api/sync...')
        syncMutation.mutate()
    }

    // Discard sync preview
    const handleDiscardSync = () => {
        setPendingSyncData(undefined)
    }

    return (
        <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-auto">
                <div className="p-4">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h1 className="text-2xl font-bold">Inventory Management</h1>
                            <p className="text-sm text-muted-foreground">
                                {pendingSyncData ? (
                                    <>
                                        <span className="text-orange-500 font-medium">Sync Preview: </span>
                                        {new Set(pendingSyncData.map((p: { shopify_product_id: number }) => p.shopify_product_id)).size} SPUs, {pendingSyncData.length} Variants
                                    </>
                                ) : products.length > 0 ? (
                                    <>
                                        {new Set(products.map((p: { shopify_product_id: number }) => p.shopify_product_id)).size} SPUs, {products.length} Variants
                                    </>
                                ) : (
                                    'Manage product costs, inventory, and internal data'
                                )}
                            </p>
                        </div>
                        <Button
                            onClick={handleSyncPreview}
                            disabled={isLoadingPreview || syncMutation.isPending}
                            variant="outline"
                        >
                            <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingPreview ? 'animate-spin' : ''}`} />
                            {isLoadingPreview ? 'Loading...' : 'Sync from Shopify'}
                        </Button>
                    </div>

                    {/* Content */}
                    {isLoading ? (
                        <div className="flex items-center justify-center h-64">
                            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : error ? (
                        <div className="text-center text-destructive">
                            Failed to load products. Please try again.
                        </div>
                    ) : (
                        <InventoryDataTable
                            products={products}
                            pendingSyncData={pendingSyncData}
                            onSaveSync={handleSaveSync}
                            onDiscardSync={handleDiscardSync}
                            isSyncing={syncMutation.isPending}
                            onRefresh={() => queryClient.invalidateQueries({ queryKey: ['products'] })}
                        />
                    )}
                </div>
            </main>
        </div>
    )
}
