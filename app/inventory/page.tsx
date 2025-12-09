'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { InventoryDataTable } from '@/components/inventory/data-table'
import { Button } from '@/components/ui/button'
import { RefreshCw, Scale } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'

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

async function fetchWeightData() {
    const response = await fetch('/api/weight-sync')
    if (!response.ok) throw new Error('Failed to fetch weight data')
    const data = await response.json()
    return data.products || []
}

async function updateWeights() {
    const response = await fetch('/api/weight-sync', { method: 'POST' })
    if (!response.ok) throw new Error('Failed to update weights')
    return response.json()
}

export default function InventoryPage() {
    const queryClient = useQueryClient()
    const [pendingSyncData, setPendingSyncData] = useState<any[] | undefined>(undefined)
    const [pendingWeightData, setPendingWeightData] = useState<any[] | undefined>(undefined)
    const [isLoadingPreview, setIsLoadingPreview] = useState(false)
    const [isLoadingWeight, setIsLoadingWeight] = useState(false)

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

    // Weight update mutation
    const weightMutation = useMutation({
        mutationFn: updateWeights,
        onSuccess: async (data) => {
            console.log('✅ Weight update successful, response:', data)
            toast.success(`Successfully updated ${data.updated} products!`, {
                duration: 4000,
                icon: '✅',
            })
            setPendingWeightData(undefined)
            await queryClient.invalidateQueries({ queryKey: ['products'] })
        },
        onError: (error) => {
            console.error('❌ Weight update failed:', error)
            toast.error('Failed to update weights. Please try again.', {
                duration: 5000,
                icon: '❌',
            })
        },
    })

    // Fetch weight data for preview
    const handleWeightUpdate = async () => {
        console.log('⚖️ handleWeightUpdate called')
        setIsLoadingWeight(true)
        try {
            console.log('📡 Fetching weight data from individual product endpoints...')
            const weightData = await fetchWeightData()
            console.log('✅ Weight data fetched:', weightData?.length, 'products')
            setPendingWeightData(weightData)
            console.log('✅ pendingWeightData set')
        } catch (error) {
            console.error('❌ Failed to fetch weight data:', error)
        } finally {
            setIsLoadingWeight(false)
            console.log('🏁 handleWeightUpdate finished')
        }
    }

    // Save weight updates to database
    const handleSaveWeight = () => {
        console.log('💾 handleSaveWeight called, triggering POST /api/weight-sync...')
        toast.loading('Updating weights... This may take a few moments.', {
            id: 'weight-update',
            duration: Infinity,
        })
        weightMutation.mutate(undefined, {
            onSettled: () => {
                toast.dismiss('weight-update')
            }
        })
    }

    // Discard weight preview
    const handleDiscardWeight = () => {
        setPendingWeightData(undefined)
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
                                ) : pendingWeightData ? (
                                    <>
                                        <span className="text-green-600 font-medium">Weight Update Preview: </span>
                                        {pendingWeightData.filter((p: any) => p.weight !== p.shopify_weight).length} products with changes
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
                        <div className="flex gap-2">
                            <Button
                                onClick={handleWeightUpdate}
                                disabled={isLoadingWeight || weightMutation.isPending || isLoadingPreview || syncMutation.isPending}
                                variant="outline"
                            >
                                <Scale className={`mr-2 h-4 w-4 ${isLoadingWeight ? 'animate-spin' : ''}`} />
                                {isLoadingWeight ? 'Updating...' : 'Update Weight'}
                            </Button>
                            <Button
                                onClick={handleSyncPreview}
                                disabled={isLoadingPreview || syncMutation.isPending || isLoadingWeight || weightMutation.isPending}
                                variant="outline"
                            >
                                <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingPreview ? 'animate-spin' : ''}`} />
                                {isLoadingPreview ? 'Loading...' : 'Sync from Shopify'}
                            </Button>
                        </div>
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
                            pendingWeightData={pendingWeightData}
                            onSaveSync={handleSaveSync}
                            onDiscardSync={handleDiscardSync}
                            onSaveWeight={handleSaveWeight}
                            onDiscardWeight={handleDiscardWeight}
                            isSyncing={syncMutation.isPending}
                            isUpdatingWeight={weightMutation.isPending}
                            onRefresh={() => queryClient.invalidateQueries({ queryKey: ['products'] })}
                        />
                    )}
                </div>
            </main>
        </div>
    )
}
