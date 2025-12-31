'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Boxes, CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { supabaseUntyped } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface SpuOption {
    shopify_product_id: number
    title: string
    image_url: string | null
    handle: string
    is_tracked: boolean
}

interface TrackingDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    availableSPUs: SpuOption[]
    onSuccess: () => void
}

export function TrackingDialog({ open, onOpenChange, availableSPUs, onSuccess }: TrackingDialogProps) {
    const [search, setSearch] = useState('')
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
    const [isSaving, setIsSaving] = useState(false)

    // Sync selectedIds with availableSPUs when dialog opens
    useEffect(() => {
        if (open) {
            const initialTracked = new Set(
                availableSPUs.filter(s => s.is_tracked).map(s => s.shopify_product_id)
            )
            setSelectedIds(initialTracked)
        }
    }, [open, availableSPUs])

    const filtered = useMemo(() => {
        return availableSPUs.filter(spu =>
            spu.title.toLowerCase().includes(search.toLowerCase()) ||
            spu.handle.toLowerCase().includes(search.toLowerCase())
        )
    }, [availableSPUs, search])

    const handleToggleLocal = (spuId: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(spuId)) {
                next.delete(spuId)
            } else {
                next.add(spuId)
            }
            return next
        })
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            // Find which SPUs have changed their tracking status
            const initialTrackedIds = new Set(
                availableSPUs.filter(s => s.is_tracked).map(s => s.shopify_product_id)
            )

            const toAdd = Array.from(selectedIds).filter(id => !initialTrackedIds.has(id))
            const toRemove = Array.from(initialTrackedIds).filter(id => !selectedIds.has(id))

            if (toAdd.length === 0 && toRemove.length === 0) {
                onOpenChange(false)
                return
            }

            // Batch update additions
            const addPromises = toAdd.map(async (spuId) => {
                const spuInfo = availableSPUs.find(s => s.shopify_product_id === spuId)
                const { data: variants } = await supabaseUntyped
                    .from('products')
                    .select('variant_id, internal_meta')
                    .eq('shopify_product_id', spuId)

                if (variants) {
                    return Promise.all(variants.map(v =>
                        supabaseUntyped.from('products').update({
                            internal_meta: {
                                ...v.internal_meta,
                                is_tracked_inventory: true,
                                spu_title: spuInfo?.title, // Freeze the title
                                manual_inventory: null,
                                inventory_updated_at: null,
                                is_manual_timestamp: false
                            }
                        }).eq('variant_id', v.variant_id)
                    ))
                }
            })

            // Batch update removals
            const removePromises = toRemove.map(async (spuId) => {
                const { data: variants } = await supabaseUntyped
                    .from('products')
                    .select('variant_id, internal_meta')
                    .eq('shopify_product_id', spuId)

                if (variants) {
                    const customVids = variants.filter(v => v.internal_meta?.custom_variant).map(v => v.variant_id)
                    const standardVids = variants.filter(v => !v.internal_meta?.custom_variant).map(v => v.variant_id)

                    const actions = []
                    if (customVids.length > 0) {
                        actions.push(supabaseUntyped.from('products').delete().in('variant_id', customVids))
                    }
                    if (standardVids.length > 0) {
                        actions.push(supabaseUntyped.from('products').update({
                            internal_meta: { is_tracked_inventory: false }
                        }).in('variant_id', standardVids))
                    }
                    return Promise.all(actions)
                }
            })

            await Promise.all([...addPromises, ...removePromises])

            toast.success('Inventory tracking updated')
            onSuccess()
            onOpenChange(false)
        } catch (error) {
            console.error('Failed to save tracking changes:', error)
            toast.error('Failed to save changes')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] max-h-[700px] h-full sm:h-auto w-[95vw] sm:w-full flex flex-col p-0 overflow-hidden">
                <div className="p-6 pb-2">
                    <DialogHeader>
                        <DialogTitle>Select Products to Track</DialogTitle>
                        <DialogDescription>
                            Choose SPUs you want to monitor in the inventory terminal.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="relative mt-4 mb-2">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Find products..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 h-10 border-slate-200"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-2">
                    <div className="space-y-1">
                        {filtered.length > 0 ? (
                            filtered.map(spu => {
                                const isSelected = selectedIds.has(spu.shopify_product_id)
                                return (
                                    <div
                                        key={spu.shopify_product_id}
                                        onClick={() => handleToggleLocal(spu.shopify_product_id)}
                                        className={cn(
                                            "flex items-center gap-3 p-2 rounded-xl border cursor-pointer transition-all",
                                            isSelected
                                                ? "bg-blue-50/50 border-blue-100"
                                                : "border-transparent hover:border-slate-100 hover:bg-slate-50"
                                        )}
                                    >
                                        <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-slate-100 border border-slate-200 shrink-0">
                                            {spu.image_url ? (
                                                <Image src={spu.image_url} alt={spu.title} fill className="object-cover" />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center">
                                                    <Boxes className="h-5 w-5 text-slate-300" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-sm text-slate-900 truncate">{spu.title}</p>
                                            <p className="text-xs text-slate-500 truncate">{spu.handle}</p>
                                        </div>
                                        <div className={cn(
                                            "flex h-8 w-8 items-center justify-center transition-colors",
                                            isSelected ? "text-blue-600" : "text-slate-300"
                                        )}>
                                            {isSelected ? (
                                                <CheckCircle2 className="h-5 w-5" />
                                            ) : (
                                                <Circle className="h-5 w-5" />
                                            )}
                                        </div>
                                    </div>
                                )
                            })
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12">
                                <p className="text-sm text-slate-400">No products found</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t bg-slate-50/50 flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className="flex-1"
                        disabled={isSaving}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        className="flex-1 bg-black text-white hover:bg-black/90"
                        disabled={isSaving}
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            'Done'
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
