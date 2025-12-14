'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { InventoryDataTable } from '@/components/inventory/data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { RefreshCw, Scale, FileSpreadsheet, ShoppingBag } from 'lucide-react'
import { ImportDialog } from '@/components/inventory/import-dialog'
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

async function fetchWeightData(mode: 'empty' | 'all' = 'all') {
    const response = await fetch(`/api/weight-sync?mode=${mode}`)
    if (!response.ok) throw new Error('Failed to fetch weight data')
    const data = await response.json()
    return data.products || []
}

async function updateWeights(mode: 'empty' | 'all' = 'all') {
    const response = await fetch(`/api/weight-sync?mode=${mode}`, { method: 'POST' })
    if (!response.ok) throw new Error('Failed to update weights')
    return response.json()
}

async function syncOrders() {
    const response = await fetch('/api/orders-sync', { method: 'POST' })
    if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to sync orders')
    }
    return response.json()
}

export default function InventoryPage() {
    const queryClient = useQueryClient()
    const [pendingSyncData, setPendingSyncData] = useState<any[] | undefined>(undefined)
    const [pendingWeightData, setPendingWeightData] = useState<any[] | undefined>(undefined)
    const [isLoadingPreview, setIsLoadingPreview] = useState(false)
    const [isLoadingWeight, setIsLoadingWeight] = useState(false)
    const [showModeDialog, setShowModeDialog] = useState(false)
    const [currentWeightMode, setCurrentWeightMode] = useState<'empty' | 'all'>('all')
    const [importDialogOpen, setImportDialogOpen] = useState(false)

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
            // Refetch data first to ensure fresh data from database
            await queryClient.invalidateQueries({ queryKey: ['products'] })
            await queryClient.refetchQueries({ queryKey: ['products'] })
            // Then clear pending state
            setPendingWeightData(undefined)
        },
        onError: (error) => {
            console.error('❌ Weight update failed:', error)
            toast.error('Failed to update weights. Please try again.', {
                duration: 5000,
                icon: '❌',
            })
        },
    })

    // Order sync mutation
    const syncOrderMutation = useMutation({
        mutationFn: syncOrders,
        onSuccess: async (data: any) => {
            console.log('✅ Order sync successful:', data)
            toast.success(data.message || 'Orders synced successfully!', {
                duration: 4000,
                icon: '✅',
            })
        },
        onError: (error) => {
            console.error('❌ Order sync failed:', error)
            toast.error(error.message || 'Failed to sync orders. Please try again.', {
                duration: 5000,
                icon: '❌',
            })
        },
    })

    // Show mode selection dialog
    const handleWeightUpdate = () => {
        setShowModeDialog(true)
    }

    // Execute weight update with selected mode
    const executeWeightUpdate = async (mode: 'empty' | 'all') => {
        setShowModeDialog(false)
        setIsLoadingWeight(true)
        setCurrentWeightMode(mode)  // Save the mode for later use in save operation

        try {
            console.log(`⚖️ Weight update mode: ${mode}`)
            const weightData = await fetchWeightData(mode)
            console.log(`✅ Weight data fetched: ${weightData?.length} products`)

            if (weightData.length === 0) {
                toast(mode === 'empty' ? 'All products already have weight values' : 'No weight changes detected', {
                    duration: 3000,
                })
            }

            setPendingWeightData(weightData)
        } catch (error) {
            console.error('❌ Failed to fetch weight data:', error)
            toast.error('Failed to fetch weight data', {
                duration: 5000,
            })
        } finally {
            setIsLoadingWeight(false)
        }
    }

    // Save weight updates to database
    const handleSaveWeight = () => {
        console.log(`💾 handleSaveWeight called with mode: ${currentWeightMode}`)
        toast.loading('Updating weights... This may take a few moments.', {
            id: 'weight-update',
            duration: Infinity,
        })
        // Pass the saved mode to the mutation
        weightMutation.mutate(currentWeightMode, {
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
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header />
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
                                    onClick={() => setImportDialogOpen(true)}
                                    variant="outline"
                                    disabled={isLoading || isLoadingWeight || isLoadingPreview}
                                >
                                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                                    Import Excel
                                </Button>
                                <Button
                                    onClick={handleWeightUpdate}
                                    disabled={isLoadingWeight || weightMutation.isPending || isLoadingPreview || syncMutation.isPending}
                                    variant="outline"
                                >
                                    <Scale className={`mr-2 h-4 w-4 ${isLoadingWeight ? 'animate-spin' : ''}`} />
                                    {isLoadingWeight ? 'Updating...' : 'Update Weight'}
                                </Button>
                                <Button
                                    onClick={() => syncOrderMutation.mutate()}
                                    disabled={syncOrderMutation.isPending || isLoadingPreview || syncMutation.isPending}
                                    variant="outline"
                                >
                                    <ShoppingBag className={`mr-2 h-4 w-4 ${syncOrderMutation.isPending ? 'animate-spin' : ''}`} />
                                    {syncOrderMutation.isPending ? 'Syncing...' : 'Sync Orders'}
                                </Button>
                                <Button
                                    onClick={handleSyncPreview}
                                    disabled={isLoadingPreview || syncMutation.isPending || isLoadingWeight || weightMutation.isPending || syncOrderMutation.isPending}
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

                    {/* Import Dialog */}
                    <ImportDialog
                        open={importDialogOpen}
                        onOpenChange={setImportDialogOpen}
                        onSuccess={() => {
                            setImportDialogOpen(false)
                            queryClient.invalidateQueries({ queryKey: ['products'] })
                        }}
                    />

                    {/* Weight Update Mode Selection Dialog */}
                    <Dialog open={showModeDialog} onOpenChange={setShowModeDialog}>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>选择更新模式</DialogTitle>
                                <DialogDescription>
                                    选择如何更新产品重量数据
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-3 py-4">
                                {/* Option 1: Only Empty Values */}
                                <Button
                                    onClick={() => executeWeightUpdate('empty')}
                                    className="w-full justify-start h-auto p-4 text-left"
                                    variant="outline"
                                >
                                    <div className="flex-1">
                                        <div className="font-semibold flex items-center gap-2 mb-1">
                                            <Scale className="h-4 w-4" />
                                            仅更新空值
                                        </div>
                                        <div className="text-sm text-muted-foreground font-normal">
                                            只检查当前 weight 为空的产品，速度快（推荐用于日常维护）
                                        </div>
                                    </div>
                                </Button>

                                {/* Option 2: Check All Changes */}
                                <Button
                                    onClick={() => executeWeightUpdate('all')}
                                    className="w-full justify-start h-auto p-4 text-left"
                                    variant="outline"
                                >
                                    <div className="flex-1">
                                        <div className="font-semibold flex items-center gap-2 mb-1">
                                            <RefreshCw className="h-4 w-4" />
                                            检查所有变动
                                        </div>
                                        <div className="text-sm text-muted-foreground font-normal">
                                            检查所有产品的 weight 变化，耗时较长（完整同步）
                                        </div>
                                    </div>
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </main>
            </div>
        </div>
    )
}
