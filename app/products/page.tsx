'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { ProductDataTable } from '@/components/products/data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { RefreshCw, Scale, FileSpreadsheet, ShoppingBag } from 'lucide-react'
import { ImportDialog } from '@/components/products/import-dialog'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useMemo } from 'react'
import toast, { Toaster } from 'react-hot-toast'

import { DateRange } from 'react-day-picker'

async function fetchProducts(dateRange?: DateRange) {
    let url = '/api/products'
    if (dateRange?.from && dateRange?.to) {
        const endDate = new Date(dateRange.to)
        endDate.setHours(23, 59, 59, 999)

        const params = new URLSearchParams({
            start_date: dateRange.from.toISOString(),
            end_date: endDate.toISOString()
        })
        url += `?${params.toString()}`
    }
    const response = await fetch(url)
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

import { subDays } from 'date-fns'

// ...

export default function ProductManagementPage() {
    const queryClient = useQueryClient()
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

    // Set default date range on mount to avoid hydration mismatch
    useEffect(() => {
        setDateRange({
            from: subDays(new Date(), 30),
            to: new Date(),
        })
    }, [])

    const [pendingSyncData, setPendingSyncData] = useState<any[] | undefined>(undefined)
    const [pendingWeightData, setPendingWeightData] = useState<any[] | undefined>(undefined)
    const [lastOrderSyncTime, setLastOrderSyncTime] = useState<string | null>(null)

    // Load last order sync time from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('lastOrderSyncTime')
        if (saved) {
            setLastOrderSyncTime(saved)
        }
    }, [])
    const [isLoadingPreview, setIsLoadingPreview] = useState(false)
    const [isLoadingWeight, setIsLoadingWeight] = useState(false)
    const [showModeDialog, setShowModeDialog] = useState(false)
    const [currentWeightMode, setCurrentWeightMode] = useState<'empty' | 'all'>('all')
    const [importDialogOpen, setImportDialogOpen] = useState(false)

    const { data: allProducts = [], isLoading, error } = useQuery({
        queryKey: ['products', dateRange],
        queryFn: () => fetchProducts(dateRange),
    })

    const products = useMemo(() => {
        return allProducts.filter((p: any) => !p.internal_meta?.custom_variant)
    }, [allProducts])


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
            // Save sync time
            if (data.synced_at) {
                setLastOrderSyncTime(data.synced_at)
                localStorage.setItem('lastOrderSyncTime', data.synced_at)
            }
            toast.success(data.message || 'Orders synced successfully!', {
                duration: 4000,
                icon: '✅',
            })
            // Refresh products to update order counts
            await queryClient.invalidateQueries({ queryKey: ['products'] })
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
                <main className="flex-1 overflow-auto">
                    <div className="p-4">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h1 className="text-2xl font-bold">Product Management</h1>
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
                                        'Manage product costs and internal data'
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
                                <div className="flex flex-col items-start">
                                    <Button
                                        onClick={() => syncOrderMutation.mutate()}
                                        disabled={syncOrderMutation.isPending || isLoadingPreview || syncMutation.isPending}
                                        variant="outline"
                                        className="w-full"
                                    >
                                        <ShoppingBag className={`mr-2 h-4 w-4 ${syncOrderMutation.isPending ? 'animate-spin' : ''}`} />
                                        {syncOrderMutation.isPending ? 'Syncing...' : 'Sync Orders'}
                                    </Button>
                                    {lastOrderSyncTime && !syncOrderMutation.isPending && (
                                        <span className="text-xs text-muted-foreground mt-1 ml-1">
                                            Last: {new Date(lastOrderSyncTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {new Date(lastOrderSyncTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    )}
                                </div>
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
                            <ProductDataTable
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
                                dateRange={dateRange}
                                onDateRangeChange={(range) => {
                                    // Only update when both dates are selected
                                    if (range?.from && range?.to) {
                                        setDateRange(range)
                                    }
                                }}
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
                        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none shadow-2xl">
                            <div className="bg-gradient-to-br from-background to-secondary/30 p-6 pt-8">
                                <DialogHeader className="mb-8">
                                    <DialogTitle className="text-2xl font-bold tracking-tight">选择更新模式</DialogTitle>
                                    <DialogDescription className="text-base">
                                        选择如何同步 Shopify 产品的重量数据
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="space-y-4">
                                    {/* Option 1: Only Empty Values */}
                                    <button
                                        onClick={() => executeWeightUpdate('empty')}
                                        className="w-full group relative flex flex-col gap-2 p-5 rounded-2xl border border-border bg-card hover:bg-accent/50 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 text-left outline-none focus:ring-2 focus:ring-primary/20"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                                                <Scale className="h-5 w-5" />
                                            </div>
                                            <span className="font-bold text-lg">仅更新空值</span>
                                        </div>
                                        <p className="text-sm text-muted-foreground leading-relaxed pl-1.5">
                                            快速扫描并补全重量缺失的产品，推荐用于日常维护，同步速度极快。
                                        </p>
                                        <div className="absolute top-4 right-5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                                        </div>
                                    </button>

                                    {/* Option 2: Check All Changes */}
                                    <button
                                        onClick={() => executeWeightUpdate('all')}
                                        className="w-full group relative flex flex-col gap-2 p-5 rounded-2xl border border-border bg-card hover:bg-accent/50 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 text-left outline-none focus:ring-2 focus:ring-primary/20"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors duration-300">
                                                <RefreshCw className="h-5 w-5" />
                                            </div>
                                            <span className="font-bold text-lg">检查所有变动</span>
                                        </div>
                                        <p className="text-sm text-muted-foreground leading-relaxed pl-1.5">
                                            全面比对所有产品的重量数据并同步更新，确保数据 100% 一致。
                                        </p>
                                    </button>
                                </div>

                                <div className="mt-8 flex justify-end">
                                    <Button
                                        variant="ghost"
                                        onClick={() => setShowModeDialog(false)}
                                        className="text-muted-foreground hover:text-foreground"
                                    >
                                        取消
                                    </Button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                </main>
            </div>
        </div>
    )
}
