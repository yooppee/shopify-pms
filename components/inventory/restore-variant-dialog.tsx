'use client'

import React, { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ProductWithCalculations } from '@/lib/supabase/types'
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RefreshCcw, Plus } from 'lucide-react'

interface RestoreVariantDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    untrackedVariants: ProductWithCalculations[]
    onRestore: (variantIds: number[]) => void
    onCreateNew: () => void
}

export function RestoreVariantDialog({
    open,
    onOpenChange,
    untrackedVariants,
    onRestore,
    onCreateNew
}: RestoreVariantDialogProps) {
    const [selectedVariants, setSelectedVariants] = useState<Set<number>>(new Set())

    const toggleVariant = (variantId: number) => {
        setSelectedVariants(prev => {
            const next = new Set(prev)
            if (next.has(variantId)) {
                next.delete(variantId)
            } else {
                next.add(variantId)
            }
            return next
        })
    }

    const handleRestore = () => {
        onRestore(Array.from(selectedVariants))
        setSelectedVariants(new Set())
        onOpenChange(false)
    }

    const handleCreateNew = () => {
        onCreateNew()
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Restore Deleted Variants?</DialogTitle>
                    <DialogDescription>
                        We found previously tracked variants for this product that are currently hidden.
                        You can restore them or create a completely new custom variant.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    <h4 className="mb-3 text-xs font-semibold uppercase text-slate-500 tracking-wider">
                        Available to Restore ({untrackedVariants.length})
                    </h4>
                    <ScrollArea className="h-[300px] w-full rounded-md border border-slate-100 p-2 bg-slate-50/50">
                        <div className="space-y-2">
                            {untrackedVariants.map((variant) => (
                                <div
                                    key={variant.variant_id}
                                    className="flex items-start space-x-3 p-3 rounded-lg hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-200 cursor-pointer bg-slate-100/50"
                                    onClick={() => toggleVariant(variant.variant_id)}
                                >
                                    <Checkbox
                                        checked={selectedVariants.has(variant.variant_id)}
                                        onCheckedChange={() => toggleVariant(variant.variant_id)}
                                        id={`restore-${variant.variant_id}`}
                                        className="mt-1"
                                    />
                                    <div className="grid gap-1.5 leading-none w-full">
                                        <label
                                            htmlFor={`restore-${variant.variant_id}`}
                                            className="text-base font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer text-slate-900"
                                        >
                                            {variant.title}
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-slate-500 font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                                {variant.sku || 'No SKU'}
                                            </span>
                                            {variant.internal_meta?.custom_variant && (
                                                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 rounded-md">
                                                    Custom
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-3 sm:gap-2">
                    <Button
                        variant="ghost"
                        onClick={handleCreateNew}
                        className="sm:mr-auto text-slate-500 hover:text-slate-900"
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Create New Custom Variant
                    </Button>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="flex-1 sm:flex-none"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleRestore}
                            disabled={selectedVariants.size === 0}
                            className="flex-1 sm:flex-none"
                        >
                            <RefreshCcw className="mr-2 h-4 w-4" />
                            Restore Selected ({selectedVariants.size})
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
