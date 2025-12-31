'use client'

import React, { useState, useMemo } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Search, Plus, Trash2, Scale, Boxes } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ProductWithCalculations } from '@/lib/supabase/types'
import Image from 'next/image'

interface SalesLink {
    variant_id: number
    title: string
    sku?: string
    weight: number
}

interface SalesLinkDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    variant: { id: number, title: string, sku?: string | null, shopify_product_id?: number, internal_meta?: any } | null
    allProducts: ProductWithCalculations[]
    onSave: (links: SalesLink[]) => void
}

export function SalesLinkDialog({ open, onOpenChange, variant, allProducts, onSave }: SalesLinkDialogProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [links, setLinks] = useState<SalesLink[]>([])

    // Initialize links when variant changes
    React.useEffect(() => {
        if (open && variant?.internal_meta?.sales_links) {
            setLinks(variant.internal_meta.sales_links)
        } else if (open) {
            setLinks([])
        }
    }, [open, variant])

    const filteredProducts = useMemo(() => {
        // Only show products from the same SPU
        const spuProducts = allProducts.filter(p => p.shopify_product_id === variant?.shopify_product_id)

        // Don't show custom variants in the linkable list (link only to standard ones)
        // Also don't show the current variant itself
        const standardProducts = spuProducts.filter(p =>
            !p.internal_meta?.custom_variant &&
            p.variant_id !== variant?.id
        )

        if (!searchQuery.trim()) return standardProducts

        const query = searchQuery.toLowerCase()
        return standardProducts.filter(p =>
            p.title.toLowerCase().includes(query) ||
            p.sku?.toLowerCase().includes(query) ||
            p.variant_id.toString().includes(query)
        )
    }, [allProducts, searchQuery, variant])

    const handleAddLink = (p: ProductWithCalculations) => {
        if (links.some(l => l.variant_id === p.variant_id)) return
        setLinks([...links, {
            variant_id: p.variant_id,
            title: p.title,
            sku: p.sku || undefined,
            weight: 1
        }])
        setSearchQuery('')
    }

    const handleRemoveLink = (variantId: number) => {
        setLinks(links.filter(l => l.variant_id !== variantId))
    }

    const handleWeightChange = (variantId: number, weight: string) => {
        const num = parseFloat(weight)
        if (isNaN(num)) return
        setLinks(links.map(l => l.variant_id === variantId ? { ...l, weight: num } : l))
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-8 pb-4 shrink-0">
                    <DialogHeader className="mb-0">
                        <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                            Sales Linking: {variant?.title}
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-sm">
                            Link this SKU to online product sales.
                            Inventory will be automatically deducted based on linked sales multiplied by the weight.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="flex-1 overflow-y-auto px-8 py-2 scrollbar-thin scrollbar-thumb-slate-200">
                    <div className="grid gap-8">
                        {/* Active Links */}
                        <div className="space-y-4">
                            <Label className="text-[11px] uppercase tracking-[0.1em] text-slate-400 font-bold">Active Sales Links</Label>
                            {links.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed rounded-2xl bg-slate-50/50 text-slate-400 text-sm">
                                    No active links. Search below to add one.
                                </div>
                            ) : (
                                <div className="grid gap-3">
                                    {links.map(link => (
                                        <div key={link.variant_id} className="flex items-center gap-4 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow group">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-sm truncate text-slate-900">{link.title}</div>
                                                <div className="text-[11px] text-slate-400 font-mono mt-0.5">{link.sku || 'No SKU'}</div>
                                            </div>
                                            <div className="flex items-center gap-4 shrink-0">
                                                <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
                                                    <Scale className="h-3.5 w-3.5 text-slate-400" />
                                                    <span className="text-xs font-bold text-slate-500">Weight:</span>
                                                    <Input
                                                        type="number"
                                                        value={link.weight}
                                                        onChange={(e) => handleWeightChange(link.variant_id, e.target.value)}
                                                        className="w-16 h-8 bg-transparent border-none text-sm font-bold focus-visible:ring-0 p-0 text-center"
                                                    />
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-9 w-9 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl"
                                                    onClick={() => handleRemoveLink(link.variant_id)}
                                                >
                                                    <Trash2 className="h-4.5 w-4.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Search Section */}
                        <div className="space-y-4">
                            <Label className="text-[11px] uppercase tracking-[0.1em] text-slate-400 font-bold">Search Online Products</Label>
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input
                                    placeholder="Search by title, SKU or variant ID..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-12 h-12 bg-slate-50/80 border-slate-100 focus-visible:ring-black rounded-2xl text-base shadow-sm"
                                />
                            </div>

                            {filteredProducts.length > 0 && (
                                <div className="mt-3 border border-slate-100 rounded-2xl overflow-hidden shadow-xl bg-white z-10">
                                    <div className="max-h-[300px] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-200">
                                        {filteredProducts.map(p => (
                                            <button
                                                key={p.variant_id}
                                                className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors text-left rounded-xl group/btn"
                                                onClick={() => handleAddLink(p)}
                                                disabled={links.some(l => l.variant_id === p.variant_id)}
                                            >
                                                <div className="h-12 w-12 relative rounded-lg border border-slate-100 overflow-hidden bg-white shrink-0 shadow-sm">
                                                    {p.image_url ? (
                                                        <Image src={p.image_url} alt="" fill className="object-cover" />
                                                    ) : (
                                                        <div className="flex items-center justify-center h-full w-full text-slate-200 bg-slate-50">
                                                            <Boxes className="h-5 w-5" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold text-slate-900 truncate group-hover/btn:text-blue-600 transition-colors">{p.title}</div>
                                                    <div className="flex items-center gap-3 mt-0.5">
                                                        <span className="text-[11px] text-slate-400 font-mono tracking-tight bg-slate-50 px-1.5 py-0.5 rounded">{p.sku || 'NO-SKU'}</span>
                                                        <span className="text-[11px] text-slate-400 font-mono">ID: {p.variant_id}</span>
                                                    </div>
                                                </div>
                                                {links.some(l => l.variant_id === p.variant_id) ? (
                                                    <Badge variant="secondary" className="bg-green-50 text-green-600 border-green-100 font-bold px-3 py-1">Linked</Badge>
                                                ) : (
                                                    <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover/btn:bg-black group-hover/btn:text-white transition-all">
                                                        <Plus className="h-4 w-4" />
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="p-6 px-8 bg-slate-50/80 border-t flex shrink-0 items-center justify-end gap-3 rounded-b-lg">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="px-6 hover:bg-slate-200/50">Cancel</Button>
                    <Button onClick={() => onSave(links)} className="bg-black text-white hover:bg-black/90 px-10 h-11 rounded-xl font-bold">
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
