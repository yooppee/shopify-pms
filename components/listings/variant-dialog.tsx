'use client'

import React, { useState, useEffect } from 'react'
import { Plus, X, List } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'

interface Option {
    id: string
    name: string
    values: string[]
}

interface VariantDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    initialOptions?: Option[]
    onSave: (options: Option[], variants: any[]) => void
    existingVariants?: any[]
}

export function VariantDialog({ open, onOpenChange, initialOptions, onSave, existingVariants = [] }: VariantDialogProps) {
    const [options, setOptions] = useState<Option[]>([
        { id: 'opt1', name: '', values: [] },
        { id: 'opt2', name: '', values: [] },
        { id: 'opt3', name: '', values: [] },
    ])
    const [currentValues, setCurrentValues] = useState<{ [key: string]: string }>({
        opt1: '',
        opt2: '',
        opt3: '',
    })

    // Load initial options when dialog opens
    useEffect(() => {
        if (open && initialOptions && initialOptions.length > 0) {
            const newOptions: Option[] = [
                { id: 'opt1', name: '', values: [] },
                { id: 'opt2', name: '', values: [] },
                { id: 'opt3', name: '', values: [] },
            ]

            initialOptions.forEach((opt, index) => {
                if (index < 3) {
                    newOptions[index] = { ...opt, id: `opt${index + 1}` }
                }
            })
            setOptions(newOptions)
        }
    }, [open, initialOptions])

    const handleAddValue = (optId: string) => {
        const val = currentValues[optId]?.trim()
        if (!val) return

        setOptions(prev => prev.map(opt => {
            if (opt.id === optId && !opt.values.includes(val)) {
                return { ...opt, values: [...opt.values, val] }
            }
            return opt
        }))
        setCurrentValues(prev => ({ ...prev, [optId]: '' }))
    }

    const handleRemoveValue = (optId: string, valueToRemove: string) => {
        setOptions(prev => prev.map(opt => {
            if (opt.id === optId) {
                return { ...opt, values: opt.values.filter(v => v !== valueToRemove) }
            }
            return opt
        }))
    }

    const handleKeyDown = (e: React.KeyboardEvent, optId: string) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleAddValue(optId)
        }
    }

    const generateVariants = () => {
        // Filter out empty options
        const validOptions = options.filter(o => o.name.trim() !== '' && o.values.length > 0)

        if (validOptions.length === 0) return []

        // Cartesian product helper
        const cartesian = (...a: any[]) => a.reduce((a, b) => a.flatMap((d: any) => b.map((e: any) => [d, e].flat())), [[]])

        const combinations = cartesian(...validOptions.map(o => o.values))

        return combinations.map((combination: string[]) => {
            // Check if this combination already exists
            const existing = existingVariants.find(v => {
                let match = true
                combination.forEach((val, idx) => {
                    const optKey = `option${idx + 1}`
                    if (v[optKey] !== val) match = false
                })
                return match
            })

            if (existing) {
                return existing
            }

            const variant: any = {
                id: uuidv4(),
                price: 0,
                compare_at_price: null,
                cost: null,
                weight: null,
            }

            // Assign option values
            combination.forEach((val, idx) => {
                variant[`option${idx + 1}`] = val
            })

            // Generate title
            variant.title = combinations.length > 1 ? combination.join(' / ') : combination[0]

            return variant
        })
    }

    const handleSave = () => {
        const validOptions = options.filter(o => o.name.trim() !== '' && o.values.length > 0)
        const variants = generateVariants()
        onSave(validOptions, variants)
        onOpenChange(false)
    }

    // Preview count
    const previewCount = options.reduce((acc, opt) => {
        if (opt.name && opt.values.length > 0) {
            return acc === 0 ? opt.values.length : acc * opt.values.length
        }
        return acc
    }, 0)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Create Variants</DialogTitle>
                    <DialogDescription>
                        Define options (e.g. Color, Size) to generate variants.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                    {options.map((opt, index) => (
                        <div key={opt.id} className="grid gap-2">
                            <Label htmlFor={`name-${opt.id}`}>Option {index + 1}</Label>
                            <div className="flex gap-2">
                                <Input
                                    id={`name-${opt.id}`}
                                    placeholder="Option Name (e.g. Color)"
                                    value={opt.name}
                                    onChange={(e) => {
                                        const newName = e.target.value
                                        setOptions(prev => prev.map(o => o.id === opt.id ? { ...o, name: newName } : o))
                                    }}
                                    className="w-1/3"
                                />
                                <div className="flex-1 relative">
                                    <Input
                                        placeholder="Add value (Enter)"
                                        value={currentValues[opt.id]}
                                        onChange={(e) => setCurrentValues(prev => ({ ...prev, [opt.id]: e.target.value }))}
                                        onKeyDown={(e) => handleKeyDown(e, opt.id)}
                                        disabled={!opt.name}
                                    />
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="absolute right-1 top-1 h-7 w-7"
                                        onClick={() => handleAddValue(opt.id)}
                                        disabled={!opt.name || !currentValues[opt.id]}
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            {opt.values.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {opt.values.map(val => (
                                        <Badge key={val} variant="secondary">
                                            {val}
                                            <button
                                                className="ml-1 hover:text-destructive"
                                                onClick={() => handleRemoveValue(opt.id, val)}
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                            )}
                            {index < options.length - 1 && <Separator className="mt-2" />}
                        </div>
                    ))}
                </div>
                <DialogFooter>
                    <div className="flex items-center justify-between w-full">
                        <span className="text-sm text-muted-foreground">
                            Will generate {previewCount} variants
                        </span>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button onClick={handleSave} disabled={previewCount === 0}>
                                Generate Variants
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
