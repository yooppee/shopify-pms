'use client'

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import toast, { Toaster } from 'react-hot-toast'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { ChevronDown, ChevronRight, AlertCircle, Loader2, Package, Pencil, Check, X, Search, Calendar as CalendarIcon, Filter, RotateCcw, ShoppingBag } from 'lucide-react'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { format, subDays, isWithinInterval } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Image from 'next/image'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn, formatNumber } from "@/lib/utils"
import { DateRange } from "react-day-picker"

// Types
interface OrderLineItem {
    id: string
    title: string
    variant_title: string
    quantity: number
    price: number
    sku: string
    image_url?: string
    cost: number | null
    is_manual_cost: boolean
}

interface Order {
    id: string
    created_at: string
    order_number: string
    customer_name: string
    total_price: number
    subtotal_price: number
    total_tax: number
    total_discounts: number
    shipping_cost: number | null
    financial_status: string
    fulfillment_status: string
    order_line_items: OrderLineItem[]
    total_cost: number
}

async function syncOrders() {
    const response = await fetch('/api/orders-sync', { method: 'POST' })
    if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to sync orders')
    }
    return response.json()
}

// Column definitions with default widths
const COLUMN_KEYS = ['date', 'order', 'products', 'customer', 'total', 'subtotal', 'discounts', 'shipping', 'payment', 'fulfillment', 'cost'] as const
const DEFAULT_WIDTHS: Record<string, number> = {
    date: 100,
    order: 90,
    products: 260,
    customer: 120,
    total: 80,
    subtotal: 80,
    discounts: 80,
    shipping: 70,
    payment: 70,
    fulfillment: 80,
    cost: 90
}

export function ProductCostTable() {
    const queryClient = useQueryClient()
    const { data: orders = [], isLoading, error } = useQuery({
        queryKey: ['orders'],
        queryFn: async () => {
            const res = await fetch('/api/orders')
            if (!res.ok) throw new Error('Failed to fetch orders')
            return (await res.json()).orders
        }
    })

    // Column sizing with localStorage persistence
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('expenses-column-widths')
            if (saved) {
                try {
                    return { ...DEFAULT_WIDTHS, ...JSON.parse(saved) }
                } catch { }
            }
        }
        return DEFAULT_WIDTHS
    })

    // Resize state
    const [resizing, setResizing] = useState<{ key: string; startX: number; startWidth: number } | null>(null)

    // Handle resize
    const handleMouseDown = useCallback((e: React.MouseEvent, columnKey: string) => {
        e.preventDefault()
        setResizing({
            key: columnKey,
            startX: e.clientX,
            startWidth: columnWidths[columnKey] || DEFAULT_WIDTHS[columnKey]
        })
    }, [columnWidths])

    useEffect(() => {
        if (!resizing) return

        const handleMouseMove = (e: MouseEvent) => {
            const diff = e.clientX - resizing.startX
            const newWidth = Math.max(50, resizing.startWidth + diff)
            setColumnWidths(prev => {
                const updated = { ...prev, [resizing.key]: newWidth }
                localStorage.setItem('expenses-column-widths', JSON.stringify(updated))
                return updated
            })
        }

        const handleMouseUp = () => {
            setResizing(null)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [resizing])

    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
    const [editingCost, setEditingCost] = useState<{ id: string; value: string } | null>(null)
    const [savingCost, setSavingCost] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [lastOrderSyncTime, setLastOrderSyncTime] = useState<string | null>(null)

    // Load last order sync time from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('lastOrderSyncTime')
        if (saved) {
            setLastOrderSyncTime(saved)
        }
    }, [])

    const syncOrderMutation = useMutation({
        mutationFn: syncOrders,
        onSuccess: async (data: any) => {
            console.log('✅ Order sync successful:', data)
            if (data.synced_at) {
                setLastOrderSyncTime(data.synced_at)
                localStorage.setItem('lastOrderSyncTime', data.synced_at)
            }
            toast.success(data.message || 'Orders synced successfully!', {
                duration: 4000,
                icon: '✅',
            })
            await queryClient.invalidateQueries({ queryKey: ['orders'] })
        },
        onError: (error) => {
            console.error('❌ Order sync failed:', error)
            toast.error(error.message || 'Failed to sync orders. Please try again.', {
                duration: 5000,
                icon: '❌',
            })
        },
    })

    // Statistics state
    const [statsColumn, setStatsColumn] = useState<string>('total_cost')
    const [statsType, setStatsType] = useState<'sum' | 'avg'>('sum')
    const [statsDateRange, setStatsDateRange] = useState<DateRange | undefined>(undefined)
    const [tempStatsDateRange, setTempStatsDateRange] = useState<DateRange | undefined>(undefined)
    const [isStatsDatePickerOpen, setIsStatsDatePickerOpen] = useState(false)

    // Sync temp date range when main range changes
    useEffect(() => {
        setTempStatsDateRange(statsDateRange)
    }, [statsDateRange])

    // Unified Filter Logic
    const filteredOrders = useMemo(() => {
        if (!orders) return []
        let data = orders

        // 1. Search Filter
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase()
            data = data.filter((order: Order) =>
                order.order_line_items.some((item: OrderLineItem) =>
                    (item.title && item.title.toLowerCase().includes(lowerTerm)) ||
                    (item.variant_title && item.variant_title.toLowerCase().includes(lowerTerm))
                )
            )
        }

        // 2. Date Filter
        if (statsDateRange?.from) {
            data = data.filter((order: Order) => {
                if (!order.created_at) return false
                const date = new Date(order.created_at)
                if (statsDateRange.to) {
                    const endDate = new Date(statsDateRange.to)
                    endDate.setHours(23, 59, 59, 999)
                    return isWithinInterval(date, { start: statsDateRange.from!, end: endDate })
                }
                return date >= statsDateRange.from!
            })
        }
        return data
    }, [orders, searchTerm, statsDateRange])

    // Calculate statistics
    const statsValue = useMemo(() => {
        if (filteredOrders.length === 0) return 0

        let filteredData = orders

        // 1. Filter by Search (reuse search term logic if desired, or keep independent?)
        // User request implies these controls are side-by-side. Usually stats apply to the *viewed* data.
        // But the user asked for a date filter specifically for the stats. 
        // Let's apply Search Filter *AND* Stats Date Filter.

        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase()
            filteredData = filteredData.filter((order: Order) =>
                order.order_line_items.some((item: OrderLineItem) =>
                    (item.title && item.title.toLowerCase().includes(lowerTerm)) ||
                    (item.variant_title && item.variant_title.toLowerCase().includes(lowerTerm))
                )
            )
        }

        // 2. Filter by Date (specific to stats)
        if (statsDateRange?.from) {
            filteredData = filteredData.filter((order: Order) => {
                if (!order.created_at) return false
                const date = new Date(order.created_at)
                if (statsDateRange.to) {
                    const endDate = new Date(statsDateRange.to)
                    endDate.setHours(23, 59, 59, 999)
                    return isWithinInterval(date, { start: statsDateRange.from!, end: endDate })
                }
                // If only from date, check if same day or after? standard is range usually requires both or is "from X"
                // isWithinInterval requires both. If only 'from', treat as "on or after"? 
                // Let's assume range selection enforces 'from' and 'to' usually, or use simple comparison
                return date >= statsDateRange.from!
            })
        }

        if (filteredData.length === 0) return 0

        // 3. Calculate value
        const total = filteredOrders.reduce((sum: number, order: Order) => {
            let val = 0
            switch (statsColumn) {
                case 'total_price': val = Number(order.total_price); break;
                case 'subtotal_price': val = Number(order.subtotal_price); break;
                case 'total_discounts': val = Math.abs(Number(order.total_discounts)); break;
                case 'shipping_cost':
                    val = order.shipping_cost ?? (
                        (Number(order.total_price) || 0)
                        - (Number(order.subtotal_price) || 0)
                        - (Number(order.total_tax) || 0)
                        + (Number(order.total_discounts) || 0)
                    );
                    break;
                case 'total_cost': val = Number(order.total_cost); break;
                case 'profit':
                    const revenue = Number(order.total_price) - (Number(order.total_tax) || 0) - (Number(order.shipping_cost) || 0)
                    const cost = Number(order.total_cost)
                    val = revenue - cost
                    break;
                default: val = 0
            }
            return sum + (isNaN(val) ? 0 : val)
        }, 0)

        return statsType === 'avg' ? (total / filteredOrders.length) : total
    }, [filteredOrders, statsColumn, statsType])




    const toggleRow = (orderId: string) => {
        const newExpanded = new Set(expandedRows)
        if (newExpanded.has(orderId)) {
            newExpanded.delete(orderId)
        } else {
            newExpanded.add(orderId)
        }
        setExpandedRows(newExpanded)
    }

    const handleSaveCost = async (lineItemId: string, newCost: string) => {
        const costValue = newCost === '' ? null : parseFloat(newCost)
        if (costValue !== null && isNaN(costValue)) return

        setSavingCost(lineItemId)
        try {
            const res = await fetch(`/api/orders/line-item/${lineItemId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ manual_cost: costValue })
            })
            if (res.ok) {
                queryClient.invalidateQueries({ queryKey: ['orders'] })
            }
        } catch (e) {
            console.error('Failed to save cost:', e)
        } finally {
            setSavingCost(null)
            setEditingCost(null)
        }
    }

    const renderCostCell = (item: OrderLineItem, showQuantity = true) => {
        const isEditing = editingCost?.id === item.id
        const isSaving = savingCost === item.id

        if (isEditing) {
            return (
                <div className="flex items-center gap-1">
                    <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="h-7 w-20 text-xs"
                        value={editingCost.value}
                        onChange={(e) => setEditingCost({ id: item.id, value: e.target.value })}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveCost(item.id, editingCost.value)
                            if (e.key === 'Escape') setEditingCost(null)
                        }}
                        autoFocus
                    />
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 hover:bg-green-100 text-green-600" onClick={() => handleSaveCost(item.id, editingCost.value)}>
                        <Check className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 hover:bg-red-100 text-red-600" onClick={() => setEditingCost(null)}>
                        <X className="h-3 w-3" />
                    </Button>
                    {item.is_manual_cost && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 hover:bg-orange-100 text-orange-600"
                            title="Revert to Inventory Cost"
                            onClick={() => handleSaveCost(item.id, '')}
                        >
                            <RotateCcw className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            )
        }

        if (isSaving) {
            return <Loader2 className="h-4 w-4 animate-spin" />
        }

        const cost = item.cost
        const quantity = showQuantity ? item.quantity : 1
        const totalCost = cost !== null ? cost * quantity : null

        let textClass = 'text-foreground'
        let displayValue = '-'

        if (cost === null || cost === undefined) {
            displayValue = '-'
            textClass = 'text-muted-foreground'
        } else if (cost === 0) {
            displayValue = formatCurrency(0)
            textClass = 'text-red-500'
        } else {
            displayValue = formatCurrency(totalCost!)
            if (item.is_manual_cost) {
                textClass = 'text-green-600 font-medium'
            }
        }

        return (
            <div
                className={`flex items-center gap-1 cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded group/cost ${textClass}`}
                onClick={() => setEditingCost({ id: item.id, value: cost?.toString() || '' })}
            >
                <span className="text-xs">{displayValue}</span>
                <Pencil className="h-3 w-3 opacity-0 group-hover/cost:opacity-50" />
            </div>
        )
    }

    if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    if (error) return <div className="flex items-center gap-2 text-destructive p-8"><AlertCircle className="h-5 w-5" /> Failed to load orders</div>

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-4 md:grid md:grid-cols-3 md:items-center">
                <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by product title key words..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="max-w-sm"
                    />
                </div>

                {/* Statistics Dashboard */}
                <div className="flex justify-center">
                    <div className="flex items-center gap-2 bg-muted/30 p-2 rounded-lg border w-fit">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Stats:</span>

                            <Select value={statsColumn} onValueChange={setStatsColumn}>
                                <SelectTrigger className="h-8 w-[130px] text-xs bg-background">
                                    <SelectValue placeholder="Column" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="total_price">Total</SelectItem>
                                    <SelectItem value="subtotal_price">Subtotal</SelectItem>
                                    <SelectItem value="total_discounts">Discounts</SelectItem>
                                    <SelectItem value="shipping_cost">Shipping</SelectItem>
                                    <SelectItem value="total_cost">Cost</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={statsType} onValueChange={(val: any) => setStatsType(val)}>
                                <SelectTrigger className="h-8 w-[90px] text-xs bg-background">
                                    <SelectValue placeholder="Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="sum">Sum</SelectItem>
                                    <SelectItem value="avg">Average</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Date Filter for Stats */}
                            <Popover open={isStatsDatePickerOpen} onOpenChange={setIsStatsDatePickerOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className={cn(
                                            "h-8 justify-start text-left font-normal text-xs bg-background",
                                            !statsDateRange && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-3 w-3" />
                                        {statsDateRange?.from ? (
                                            statsDateRange.to ? (
                                                <>
                                                    {format(statsDateRange.from, "LLL dd, y")} -{" "}
                                                    {format(statsDateRange.to, "LLL dd, y")}
                                                </>
                                            ) : (
                                                format(statsDateRange.from, "LLL dd, y")
                                            )
                                        ) : (
                                            <span>Pick a date</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                    <div className="flex">
                                        <div className="flex flex-col border-r py-2 min-w-[140px]">
                                            {[
                                                { label: 'Today', days: 0 },
                                                { label: 'Yesterday', days: 1, offset: true },
                                                { label: 'Last 7 days', days: 7 },
                                                { label: 'Last 30 days', days: 30 },
                                                { label: 'Last 90 days', days: 90 },
                                                { label: 'Last 365 days', days: 365 },
                                            ].map((preset) => (
                                                <button
                                                    key={preset.label}
                                                    className="px-4 py-2 text-sm text-left hover:bg-accent transition-colors"
                                                    onClick={() => {
                                                        const today = new Date()
                                                        today.setHours(0, 0, 0, 0)
                                                        let from: Date, to: Date
                                                        if (preset.offset) {
                                                            from = subDays(today, preset.days)
                                                            to = subDays(today, preset.days)
                                                        } else if (preset.days === 0) {
                                                            from = today; to = today;
                                                        } else {
                                                            from = subDays(today, preset.days)
                                                            to = today
                                                        }
                                                        setTempStatsDateRange({ from, to })
                                                    }}
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                            <div className="border-t my-1"></div>
                                            <button
                                                className="px-4 py-2 text-sm text-left hover:bg-accent transition-colors text-red-500"
                                                onClick={() => {
                                                    setStatsDateRange(undefined)
                                                    setTempStatsDateRange(undefined)
                                                    setIsStatsDatePickerOpen(false)
                                                }}
                                            >
                                                Clear Filter
                                            </button>
                                        </div>
                                        <div className="flex flex-col">
                                            <Calendar
                                                mode="range"
                                                defaultMonth={tempStatsDateRange?.from}
                                                selected={tempStatsDateRange}
                                                onSelect={setTempStatsDateRange}
                                                numberOfMonths={2}
                                                className="p-3"
                                            />
                                            <div className="flex items-center justify-end gap-2 p-3 border-t bg-muted/10">
                                                <Button variant="ghost" size="sm" onClick={() => setIsStatsDatePickerOpen(false)}>Cancel</Button>
                                                <Button size="sm" onClick={() => {
                                                    setStatsDateRange(tempStatsDateRange)
                                                    setIsStatsDatePickerOpen(false)
                                                }}>Apply</Button>
                                            </div>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>

                        </div>

                        <div className="h-8 w-px bg-border mx-1"></div>

                        <div className="flex items-center px-3 h-8 bg-background rounded border min-w-[100px] justify-center">
                            <span className="font-mono font-bold text-sm text-primary">
                                {formatCurrency(statsValue)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Empty third column for grid alignment */}
                {/* Sync Orders Button */}
                <div className="flex flex-col items-end justify-center">
                    <Button
                        onClick={() => syncOrderMutation.mutate()}
                        disabled={syncOrderMutation.isPending}
                        variant="outline"
                        size="sm"
                        className="h-8"
                    >
                        <ShoppingBag className={`mr-2 h-4 w-4 ${syncOrderMutation.isPending ? 'animate-spin' : ''}`} />
                        {syncOrderMutation.isPending ? 'Syncing...' : 'Sync Orders'}
                    </Button>
                    {lastOrderSyncTime && !syncOrderMutation.isPending && (
                        <span className="text-[10px] text-muted-foreground mt-1">
                            Last: {new Date(lastOrderSyncTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {new Date(lastOrderSyncTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                </div>
            </div>

            <div className="border rounded-md bg-white">
                <Table className="table-fixed">
                    <TableHeader>
                        <TableRow>
                            <TableHead style={{ width: columnWidths.date, position: 'relative' }}>
                                Date
                                <div onMouseDown={(e) => handleMouseDown(e, 'date')} className={`absolute right-0 top-0 h-full w-px cursor-col-resize select-none touch-none ${resizing?.key === 'date' ? 'bg-primary' : 'bg-border hover:bg-gray-400'}`} />
                            </TableHead>
                            <TableHead style={{ width: columnWidths.order, position: 'relative' }}>
                                Order #
                                <div onMouseDown={(e) => handleMouseDown(e, 'order')} className={`absolute right-0 top-0 h-full w-px cursor-col-resize select-none touch-none ${resizing?.key === 'order' ? 'bg-primary' : 'bg-border hover:bg-gray-400'}`} />
                            </TableHead>
                            <TableHead style={{ width: columnWidths.products, position: 'relative' }}>
                                Product(s)
                                <div onMouseDown={(e) => handleMouseDown(e, 'products')} className={`absolute right-0 top-0 h-full w-px cursor-col-resize select-none touch-none ${resizing?.key === 'products' ? 'bg-primary' : 'bg-border hover:bg-gray-400'}`} />
                            </TableHead>
                            <TableHead style={{ width: columnWidths.customer, position: 'relative' }}>
                                Customer
                                <div onMouseDown={(e) => handleMouseDown(e, 'customer')} className={`absolute right-0 top-0 h-full w-px cursor-col-resize select-none touch-none ${resizing?.key === 'customer' ? 'bg-primary' : 'bg-border hover:bg-gray-400'}`} />
                            </TableHead>
                            <TableHead style={{ width: columnWidths.total, position: 'relative' }}>
                                Total
                                <div onMouseDown={(e) => handleMouseDown(e, 'total')} className={`absolute right-0 top-0 h-full w-px cursor-col-resize select-none touch-none ${resizing?.key === 'total' ? 'bg-primary' : 'bg-border hover:bg-gray-400'}`} />
                            </TableHead>
                            <TableHead style={{ width: columnWidths.subtotal, position: 'relative' }}>
                                Subtotal
                                <div onMouseDown={(e) => handleMouseDown(e, 'subtotal')} className={`absolute right-0 top-0 h-full w-px cursor-col-resize select-none touch-none ${resizing?.key === 'subtotal' ? 'bg-primary' : 'bg-border hover:bg-gray-400'}`} />
                            </TableHead>
                            <TableHead style={{ width: columnWidths.discounts, position: 'relative' }}>
                                Discounts
                                <div onMouseDown={(e) => handleMouseDown(e, 'discounts')} className={`absolute right-0 top-0 h-full w-px cursor-col-resize select-none touch-none ${resizing?.key === 'discounts' ? 'bg-primary' : 'bg-border hover:bg-gray-400'}`} />
                            </TableHead>
                            <TableHead style={{ width: columnWidths.shipping, position: 'relative' }}>
                                Shipping
                                <div onMouseDown={(e) => handleMouseDown(e, 'shipping')} className={`absolute right-0 top-0 h-full w-px cursor-col-resize select-none touch-none ${resizing?.key === 'shipping' ? 'bg-primary' : 'bg-border hover:bg-gray-400'}`} />
                            </TableHead>
                            <TableHead style={{ width: columnWidths.payment, position: 'relative' }}>
                                Payment
                                <div onMouseDown={(e) => handleMouseDown(e, 'payment')} className={`absolute right-0 top-0 h-full w-px cursor-col-resize select-none touch-none ${resizing?.key === 'payment' ? 'bg-primary' : 'bg-border hover:bg-gray-400'}`} />
                            </TableHead>
                            <TableHead style={{ width: columnWidths.fulfillment, position: 'relative' }}>
                                Fulfillment
                                <div onMouseDown={(e) => handleMouseDown(e, 'fulfillment')} className={`absolute right-0 top-0 h-full w-px cursor-col-resize select-none touch-none ${resizing?.key === 'fulfillment' ? 'bg-primary' : 'bg-border hover:bg-gray-400'}`} />
                            </TableHead>
                            <TableHead style={{ width: columnWidths.cost, position: 'relative' }} className="bg-amber-50 border-l-2 border-l-amber-300 font-semibold text-amber-700">
                                Cost
                                <div onMouseDown={(e) => handleMouseDown(e, 'cost')} className={`absolute right-0 top-0 h-full w-px cursor-col-resize select-none touch-none ${resizing?.key === 'cost' ? 'bg-primary' : 'bg-border hover:bg-gray-400'}`} />
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredOrders.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={11} className="h-24 text-center">
                                    No orders found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredOrders.map((order: Order) => {
                                const isExpanded = expandedRows.has(order.id)
                                const hasMultipleItems = order.order_line_items && order.order_line_items.length > 1
                                const firstItem = order.order_line_items?.[0]

                                // Use synced shipping cost, fallback to calculation for backward compatibility if needed
                                // But user said calculation is inaccurate, so prefer synced value.
                                // If sync hasn't run, shipping_cost might be null.
                                const shippingCost = order.shipping_cost ?? (
                                    (Number(order.total_price) || 0)
                                    - (Number(order.subtotal_price) || 0)
                                    - (Number(order.total_tax) || 0)
                                    + (Number(order.total_discounts) || 0)
                                )

                                return (
                                    <>
                                        <TableRow key={order.id} className={`group ${Number(order.total_price) === 0 ? 'bg-pink-50 hover:bg-pink-100' : ''}`}>
                                            <TableCell className="font-medium">
                                                {order.created_at ? format(new Date(order.created_at), 'yyyy/MM/dd') : '-'}
                                                <div className="text-xs text-muted-foreground">
                                                    {order.created_at ? format(new Date(order.created_at), 'HH:mm') : ''}
                                                </div>
                                            </TableCell>
                                            <TableCell>{order.order_number}</TableCell>
                                            <TableCell className="overflow-hidden">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    {hasMultipleItems ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 p-0 px-2 gap-1 text-muted-foreground hover:text-foreground"
                                                            onClick={() => toggleRow(order.id)}
                                                        >
                                                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                            <span>{order.order_line_items.length} items</span>
                                                        </Button>
                                                    ) : (
                                                        <div className="flex items-center gap-2 py-1 overflow-hidden min-w-0">
                                                            {firstItem?.image_url ? (
                                                                <div className="relative h-8 w-8 rounded overflow-hidden border flex-shrink-0">
                                                                    <Image
                                                                        src={firstItem.image_url}
                                                                        alt={firstItem.title}
                                                                        fill
                                                                        className="object-cover"
                                                                        sizes="32px"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <Package className="h-8 w-8 p-1.5 text-muted-foreground bg-muted/50 rounded flex-shrink-0" />
                                                            )}
                                                            <div className="flex flex-col min-w-0 overflow-hidden">
                                                                <span className="truncate text-sm font-medium" title={firstItem?.title}>{firstItem?.title || 'No Item'}</span>
                                                                {firstItem?.variant_title && firstItem?.variant_title !== 'Default Title' && (
                                                                    <span className="text-xs text-muted-foreground truncate" title={firstItem?.variant_title}>
                                                                        {firstItem.variant_title}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="overflow-hidden"><span className="block truncate" title={order.customer_name || 'Guest'}>{order.customer_name || 'Guest'}</span></TableCell>
                                            <TableCell>{formatCurrency(order.total_price)}</TableCell>
                                            <TableCell>{formatCurrency(order.subtotal_price)}</TableCell>
                                            <TableCell className="text-red-500">{formatCurrency(-Math.abs(order.total_discounts))}</TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {shippingCost > 0 ? formatCurrency(shippingCost) : '-'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={`capitalize ${order.financial_status === 'paid' ? 'bg-green-50 text-green-700 border-green-200' :
                                                        order.financial_status === 'refunded' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                            'bg-gray-50 text-gray-700 border-gray-200'
                                                        }`}
                                                >
                                                    {order.financial_status || 'Unknown'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={`capitalize ${order.fulfillment_status === 'fulfilled' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                        'bg-yellow-50 text-yellow-700 border-yellow-200'
                                                        }`}
                                                >
                                                    {order.fulfillment_status || 'Unfulfilled'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="bg-amber-50/50 border-l-2 border-l-amber-300">
                                                {!hasMultipleItems && firstItem ? (
                                                    renderCostCell(firstItem)
                                                ) : (
                                                    order.total_cost > 0 ? (
                                                        <span className="text-sm font-medium text-amber-700">{formatCurrency(order.total_cost)}</span>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">-</span>
                                                    )
                                                )}
                                            </TableCell>
                                        </TableRow>
                                        {isExpanded && hasMultipleItems && (
                                            <>
                                                {order.order_line_items.map((item, idx) => (
                                                    <TableRow key={item.id || idx} className="bg-muted/30 hover:bg-muted/30 border-b-0">
                                                        <TableCell colSpan={2}></TableCell>
                                                        <TableCell colSpan={3}>
                                                            <div className="flex items-center gap-2 pl-2">
                                                                {item.image_url ? (
                                                                    <div className="relative h-10 w-10 rounded overflow-hidden border flex-shrink-0">
                                                                        <Image
                                                                            src={item.image_url}
                                                                            alt={item.title}
                                                                            fill
                                                                            className="object-cover"
                                                                            sizes="40px"
                                                                        />
                                                                    </div>
                                                                ) : (
                                                                    <Package className="h-10 w-10 p-2 text-muted-foreground bg-muted/50 rounded flex-shrink-0" />
                                                                )}
                                                                <div className="flex flex-col min-w-0 overflow-hidden">
                                                                    <span className="text-sm font-medium truncate" title={item.title}>{item.title}</span>
                                                                    {item.variant_title && item.variant_title !== 'Default Title' && (
                                                                        <span className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md mt-1 w-fit border border-slate-200 dark:border-slate-700 truncate max-w-full">
                                                                            {item.variant_title}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span className="text-xs text-muted-foreground ml-1">x{item.quantity}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {formatCurrency(item.price * item.quantity)}
                                                        </TableCell>
                                                        <TableCell colSpan={4}></TableCell>
                                                        <TableCell className="bg-amber-50/50 border-l-2 border-l-amber-300">
                                                            {renderCostCell(item)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </>
                                        )}
                                    </>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
