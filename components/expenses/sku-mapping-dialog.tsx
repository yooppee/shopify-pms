'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { Loader2, Search, Link as LinkIcon } from 'lucide-react'
import Image from 'next/image'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

interface SkuMappingDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    inputSku: string
    onSuccess?: () => void
}

export function SkuMappingDialog({ open, onOpenChange, inputSku, onSuccess }: SkuMappingDialogProps) {
    const queryClient = useQueryClient()
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null)

    // Fetch products for selection
    const { data: products = [], isLoading } = useQuery({
        queryKey: ['products-for-mapping'],
        queryFn: async () => {
            const res = await fetch('/api/products')
            if (!res.ok) throw new Error('Failed to fetch products')
            const data = await res.json()
            return data.products || []
        },
        staleTime: 5 * 60 * 1000, // Client side cache for 5 mins
    })

    // Filter products based on search term
    const filteredProducts = useMemo(() => {
        if (!searchTerm) return products.slice(0, 50) // Limit initial display
        const lower = searchTerm.toLowerCase()
        return products.filter((p: any) =>
            p.title.toLowerCase().includes(lower) ||
            (p.sku && p.sku.toLowerCase().includes(lower))
        ).slice(0, 50)
    }, [products, searchTerm])

    const mutation = useMutation({
        mutationFn: async () => {
            if (!selectedVariantId) return
            const res = await fetch('/api/sku-mappings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input_sku: inputSku,
                    target_variant_id: selectedVariantId
                })
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'Failed to map SKU')
            }
            return res.json()
        },
        onSuccess: () => {
            toast.success('SKU mapped successfully!')
            queryClient.invalidateQueries({ queryKey: ['orders'] })
            queryClient.invalidateQueries({ queryKey: ['products'] }) // Refresh products too for order counts
            onSuccess?.()
            onOpenChange(false)
        },
        onError: (err: any) => {
            toast.error(err.message || 'Failed to map SKU')
        }
    })

    const handleSave = () => {
        if (selectedVariantId) {
            mutation.mutate()
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] h-[500px] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Link Unmatched SKU: <span className="font-mono text-sm bg-muted px-2 py-1 rounded">{inputSku}</span></DialogTitle>
                </DialogHeader>

                <div className="flex items-center gap-2 border rounded-md px-3 py-2 mt-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search for product name or SKU..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="border-none shadow-none focus-visible:ring-0 h-auto p-0"
                    />
                </div>

                <div className="flex-1 min-h-0 bg-muted/20 rounded-md border mt-2 overflow-hidden relative">
                    {isLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <ScrollArea className="h-full">
                            <div className="p-2 space-y-1">
                                {filteredProducts.length === 0 ? (
                                    <div className="text-center text-sm text-muted-foreground py-8">
                                        No matching products found.
                                    </div>
                                ) : (
                                    filteredProducts.map((product: any) => (
                                        <div
                                            key={product.variant_id}
                                            className={cn(
                                                "flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors border border-transparent",
                                                selectedVariantId === product.variant_id
                                                    ? "bg-primary/10 border-primary"
                                                    : "hover:bg-muted"
                                            )}
                                            onClick={() => setSelectedVariantId(product.variant_id)}
                                        >
                                            <div className="relative h-10 w-10 bg-muted rounded overflow-hidden flex-shrink-0 border">
                                                {product.image_url ? (
                                                    <Image
                                                        src={product.image_url}
                                                        alt={product.title}
                                                        fill
                                                        className="object-cover"
                                                        sizes="40px"
                                                    />
                                                ) : (
                                                    <div className="flex items-center justify-center h-full text-xs text-muted-foreground">No Img</div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm truncate">{product.title}</div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    {product.sku && (
                                                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                            {product.sku}
                                                        </span>
                                                    )}
                                                    <span className="text-xs text-muted-foreground">
                                                        ID: {product.variant_id}
                                                    </span>
                                                </div>
                                            </div>
                                            {selectedVariantId === product.variant_id && (
                                                <div className="h-2 w-2 rounded-full bg-primary" />
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    )}
                </div>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={!selectedVariantId || mutation.isPending}>
                        {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Link Product
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
