'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { ListingsDataTable, ListingDraft } from '@/components/listings/data-table'
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
                status: 'draft',
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

    const handleDuplicateProduct = async (listing: ListingDraft) => {
        const newDraftData = { ...listing.draft_data }

        // Append (Copy) to title
        if (newDraftData.title) {
            newDraftData.title = `${newDraftData.title} (Copy)`
        } else {
            newDraftData.title = '(Copy)'
        }

        // Ensure standard fields are preserved
        delete (newDraftData as any).id // Reset ID

        // Variants handling: We need to reset IDs for variants as well
        if (newDraftData.variants && Array.isArray(newDraftData.variants)) {
            newDraftData.variants = newDraftData.variants.map((v: any) => {
                const newV = { ...v }
                delete newV.id
                delete newV.product_id
                return newV
            })
        }

        try {
            await createMutation.mutateAsync(newDraftData)
        } catch (error) {
            // Error handled by mutation
        }
    }

    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-8">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-3xl font-bold">Listings</h1>
                    <div className="flex items-center space-x-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => queryClient.invalidateQueries({ queryKey: ['listings'] })}
                            disabled={isFetching}
                        >
                            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                        <Button onClick={handleAddProduct} disabled={createMutation.isPending}>
                            Add Product
                        </Button>
                    </div>
                </div>

                {isLoading ? (
                    <div>Loading listings...</div>
                ) : error ? (
                    <div>Error: {error.message}</div>
                ) : (
                    <ListingsDataTable
                        listings={listings}
                        onAddProduct={handleAddProduct}
                        onUpdateProduct={handleUpdateProduct}
                        onDeleteProduct={handleDeleteProduct}
                        onDuplicateProduct={handleDuplicateProduct}
                        onDeleteVariant={handleDeleteVariant}
                        onSyncSuccess={() => queryClient.invalidateQueries({ queryKey: ['listings'] })}
                        isLoading={isGlobalLoading}
                    />
                )}

                {/* Delete Product Confirmation Dialog */}
                <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Confirm Deletion</DialogTitle>
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

                {/* Delete Variant Confirmation Dialog */}
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
            </main>
            <Toaster position="bottom-right" />
        </div>
    )
}
