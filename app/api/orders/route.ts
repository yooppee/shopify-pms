import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Create Supabase client with service role key
function createServiceRoleClient() {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
    }
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            }
        }
    )
}

export async function GET() {
    try {
        const supabase = createServiceRoleClient()

        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                *,
                order_line_items (*)
            `)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Failed to fetch orders:', error)
            return NextResponse.json(
                { error: 'Failed to fetch orders', details: error.message },
                { status: 500 }
            )
        }

        // Extract all variant IDs from line items
        const variantIds = new Set<number>()
        orders.forEach((order: any) => {
            order.order_line_items?.forEach((item: any) => {
                if (item.variant_id) {
                    variantIds.add(item.variant_id)
                }
            })
        })

        // Fetch product images and cost prices for these variants
        const { data: products } = await supabase
            .from('products')
            .select('variant_id, image_url, internal_meta')
            .in('variant_id', Array.from(variantIds))

        // Create a map of variant_id -> { image_url, cost_price }
        const productMap = new Map<number, { image_url: string | null, cost_price: number | null }>()
        products?.forEach((product: any) => {
            productMap.set(product.variant_id, {
                image_url: product.image_url || null,
                cost_price: product.internal_meta?.cost_price || null
            })
        })

        // Attach image_url and cost to line items and calculate order total cost
        const enrichedOrders = orders.map((order: any) => {
            let totalOrderCost = 0

            const enrichedLineItems = order.order_line_items.map((item: any) => {
                const productData = productMap.get(item.variant_id)
                const inventoryCost = productData?.cost_price || 0
                const manualCost = item.manual_cost // This comes from the DB directly

                // Determine final cost: manual overrides inventory
                // But we want to preserve the info about whether it's manual
                const finalCost = manualCost !== null ? manualCost : inventoryCost

                const quantity = item.quantity || 0
                totalOrderCost += (Number(finalCost) * quantity)

                return {
                    ...item,
                    image_url: productData?.image_url || null,
                    cost: finalCost,
                    is_manual_cost: manualCost !== null
                }
            })

            return {
                ...order,
                order_line_items: enrichedLineItems,
                total_cost: totalOrderCost
            }
        })

        return NextResponse.json({ orders: enrichedOrders })
    } catch (error: any) {
        console.error('Fetch orders error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch orders', details: error?.message },
            { status: 500 }
        )
    }
}
