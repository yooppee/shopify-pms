'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { ListingsDataTable } from '@/components/listings/data-table'
import { RefreshCw } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast, { Toaster } from 'react-hot-toast'

// API functions
async function fetchListings() {
    const response = await fetch('/api/listings')
    if (!response.ok) throw new Error('Failed to fetch listings')
    const data = await response.json()
    return data.listings || []
}

async function createListing(data: any) {
    const response = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    })
    if (!response.ok) {
        const err = await response.json()
        throw new Error(err.details || err.error || 'Failed to create listing')
    }
    return response.json()
}

async function updateListing(id: string, updates: any) {
    const response = await fetch('/api/listings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
    })
    if (!response.ok) throw new Error('Failed to update listing')
    return response.json()
}

async function deleteListing(id: string) {
    const response = await fetch(`/api/listings?id=${id}`, {
        method: 'DELETE',
    })
    if (!response.ok) throw new Error('Failed to delete listing')
    return response.json()
}

import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { useState } from 'react'

export default function ListingsPage() {
    const queryClient = useQueryClient()
    const [deleteId, setDeleteId] = useState<string | null>(null)

    // Fetch listings
    const { data: listings = [], isLoading, isFetching, error } = useQuery({
        queryKey: ['listings'],
        queryFn: fetchListings,
    })


    // Create mutation
    const createMutation = useMutation({
        mutationFn: createListing,
        onSuccess: () => {
            toast.success('New product created!')
            return queryClient.invalidateQueries({ queryKey: ['listings'] })
        },
        onError: (error: any) => {
            console.error('Create failed:', error)
            toast.error(`Failed to create product: ${error.message}`)
        },
    })

    // Update mutation
    const updateMutation = useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: any }) => updateListing(id, updates),
        onSuccess: () => {
            return queryClient.invalidateQueries({ queryKey: ['listings'] })
        },
        onError: (error) => {
            console.error('Update failed:', error)
            toast.error('Failed to update product')
        },
    })

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: deleteListing,
        onSuccess: () => {
            toast.success('Product deleted!')
            return queryClient.invalidateQueries({ queryKey: ['listings'] })
        },
        onError: (error) => {
            console.error('Delete failed:', error)
            toast.error('Failed to delete product')
        },
    })

    const isGlobalLoading = isFetching || createMutation.isPending || updateMutation.isPending || deleteMutation.isPending

    const [deleteVariantInfo, setDeleteVariantInfo] = useState<{ id: string, parentId: string } | null>(null)

    // Handlers
    const handleAddProduct = async () => {
        try {
            await createMutation.mutateAsync({
                title: 'New Product',
                price: 0,
            })
        } catch (e) {
            // Error handled by mutation
        }
    }

    const handleUpdateProduct = (id: string, updates: any) => {
        return updateMutation.mutateAsync({ id, updates })
    }

    const handleDeleteProduct = (id: string) => {
        setDeleteId(id)
    }

    const handleDeleteVariant = (variantId: string, parentId: string) => {
        setDeleteVariantInfo({ id: variantId, parentId })
    }

    const confirmDeleteVariant = () => {
        if (!deleteVariantInfo) return

        const { id: variantId, parentId } = deleteVariantInfo
        const listing = listings.find((l: any) => l.id === parentId)

        if (listing && listing.draft_data.variants) {
            const newVariants = listing.draft_data.variants.filter((v: any) => v.id !== variantId)
            updateMutation.mutate({
                id: parentId,
                updates: { ...listing.draft_data, variants: newVariants }
            })
            toast.success('Variant deleted')
        }
        setDeleteVariantInfo(null)
    }

    return (
        <div className="flex h-screen">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <main className="flex-1 overflow-auto">
                    <div className="p-4">
                        {/* Header */}
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h1 className="text-2xl font-bold">Product Listings</h1>
                                <p className="text-sm text-muted-foreground">
                                    {listings.length > 0
                                        ? `${listings.length} products`
                                        : 'Create and manage product listings for Shopify'}
                                </p>
                            </div>
                            {isGlobalLoading && (
                                <div className="flex items-center gap-2 text-primary animate-in fade-in duration-300">
                                    <RefreshCw className="h-5 w-5 animate-spin" />
                                    <span className="text-sm font-medium">Syncing...</span>
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        {isLoading ? (
                            <div className="flex items-center justify-center h-64">
                                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : error ? (
                            <div className="text-center text-destructive">
                                Failed to load listings. Please try again.
                            </div>
                        ) : (
                            <ListingsDataTable
                                listings={listings}
                                onAddProduct={handleAddProduct}
                                onUpdateProduct={handleUpdateProduct}
                                onDeleteProduct={handleDeleteProduct}
                                onDeleteVariant={handleDeleteVariant}
                                onSyncSuccess={() => queryClient.invalidateQueries({ queryKey: ['listings'] })}
                                isLoading={createMutation.isPending || updateMutation.isPending || deleteMutation.isPending}
                            />
                        )}

                        {/* Delete Confirmation Dialog */}
                        <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Delete Product</DialogTitle>
                                    <DialogDescription>
                                        Are you sure you want to delete this product? This action cannot be undone.
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
                                    <Button
                                        variant="destructive"
                                        onClick={() => {
                                            if (deleteId) {
                                                deleteMutation.mutate(deleteId)
                                                setDeleteId(null)
                                            }
                                        }}
                                        disabled={deleteMutation.isPending}
                                    >
                                        Delete
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                        {/* Variant Delete Dialog */}
                        <Dialog open={!!deleteVariantInfo} onOpenChange={(open) => !open && setDeleteVariantInfo(null)}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Delete Variant</DialogTitle>
                                    <DialogDescription>
                                        Are you sure you want to delete this variant?
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setDeleteVariantInfo(null)}>Cancel</Button>
                                    <Button
                                        variant="destructive"
                                        onClick={confirmDeleteVariant}
                                        disabled={updateMutation.isPending}
                                    >
                                        Delete Variant
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </main>
            </div>
            <Toaster position="bottom-right" />
        </div>
    )
}
