'use client'

import { useQuery } from '@tanstack/react-query'
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
import { ChevronDown, ChevronRight, AlertCircle, Loader2, Package } from 'lucide-react'
import { useState } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'

// Types
interface OrderLineItem {
    id: string
    title: string
    variant_title: string
    quantity: number
    price: number
    sku: string
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
}

export function ProductCostTable() {
    const { data: orders = [], isLoading, error } = useQuery({
        queryKey: ['orders'],
        queryFn: async () => {
            const res = await fetch('/api/orders')
            if (!res.ok) throw new Error('Failed to fetch orders')
            return (await res.json()).orders
        }
    })

    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

    const toggleRow = (orderId: string) => {
        const newExpanded = new Set(expandedRows)
        if (newExpanded.has(orderId)) {
            newExpanded.delete(orderId)
        } else {
            newExpanded.add(orderId)
        }
        setExpandedRows(newExpanded)
    }

    if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    if (error) return <div className="flex items-center gap-2 text-destructive p-8"><AlertCircle className="h-5 w-5" /> Failed to load orders</div>

    return (
        <div className="border rounded-md bg-white">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[180px]">Date</TableHead>
                        <TableHead>Order #</TableHead>
                        <TableHead className="min-w-[300px]">Product(s)</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Subtotal</TableHead>
                        <TableHead>Discounts</TableHead>
                        <TableHead>Shipping</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Fulfillment</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {orders.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center">
                                No orders found.
                            </TableCell>
                        </TableRow>
                    ) : (
                        orders.map((order: Order) => {
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
                                    <TableRow key={order.id} className="group">
                                        <TableCell className="font-medium">
                                            {order.created_at ? format(new Date(order.created_at), 'yyyy/MM/dd') : '-'}
                                            <div className="text-xs text-muted-foreground">
                                                {order.created_at ? format(new Date(order.created_at), 'HH:mm') : ''}
                                            </div>
                                        </TableCell>
                                        <TableCell>{order.order_number}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
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
                                                    <div className="flex items-center gap-2 py-1">
                                                        <Package className="h-4 w-4 text-muted-foreground" />
                                                        <span className="truncate max-w-[300px]" title={firstItem?.title}>{firstItem?.title || 'No Item'}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>{order.customer_name || 'Guest'}</TableCell>
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
                                    </TableRow>
                                    {isExpanded && hasMultipleItems && (
                                        <>
                                            {order.order_line_items.map((item, idx) => (
                                                <TableRow key={item.id || idx} className="bg-muted/30 hover:bg-muted/30 border-b-0">
                                                    <TableCell colSpan={2}></TableCell>
                                                    <TableCell colSpan={3}>
                                                        <div className="flex items-center gap-2 pl-2">
                                                            <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-medium">{item.title}</span>
                                                                {item.variant_title && item.variant_title !== 'Default Title' && (
                                                                    <span className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md mt-1 w-fit border border-slate-200 dark:border-slate-700">
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
    )
}
