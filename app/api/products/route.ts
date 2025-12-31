import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Create Supabase client with service role key to ensure consistent data access
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

/**
 * GET /api/products
 * Fetches products from Supabase database
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams
        const startDate = searchParams.get('start_date')
        const endDate = searchParams.get('end_date')

        // Use service role key to ensure we're reading the same data that sync writes
        const supabase = createServiceRoleClient()

        // Use range to fetch all products - Supabase has default response limits
        const { data: products, error } = await supabase
            .from('products')
            .select('*')
            .order('shopify_product_id', { ascending: true })
            .range(0, 9999)

        if (error) {
            console.error('Supabase fetch error:', error)
            return NextResponse.json(
                { error: 'Failed to fetch products', details: error.message },
                { status: 500 }
            )
        }

        // Initialize order count map for general product management
        const dateRangeOrderCounts: Record<number, number> = {}
        if (startDate && endDate) {
            const { data: lineItems, error: orderError } = await supabase
                .from('order_line_items')
                .select('variant_id, quantity, orders!inner(created_at)')
                .gte('orders.created_at', startDate)
                .lte('orders.created_at', endDate)

            if (!orderError && lineItems) {
                lineItems.forEach((item: any) => {
                    const vid = item.variant_id
                    const qty = item.quantity || 0
                    if (vid) {
                        dateRangeOrderCounts[vid] = (dateRangeOrderCounts[vid] || 0) + qty
                    }
                })
            }
        }

        // Calculate sold_since_update for tracked products
        const trackedProducts = products?.filter(p => p.internal_meta?.is_tracked_inventory) || []
        const variantSoldMap: Record<number, number> = {}
        const variantBreakdownMap: Record<number, any[]> = {}

        if (trackedProducts.length > 0) {
            // Need to fetch sales for:
            // 1. The tracked variants themselves
            // 2. Any variants linked via sales_links
            const linkedVariantIds = new Set<number>()
            trackedProducts.forEach(p => {
                const links = p.internal_meta?.sales_links || []
                links.forEach((l: any) => linkedVariantIds.add(l.variant_id))
            })

            const allNeededVariantIds = Array.from(new Set([
                ...trackedProducts.map(p => p.variant_id),
                ...Array.from(linkedVariantIds)
            ]))

            // Find the earliest update timestamp
            const timestamps = trackedProducts
                .map(p => p.internal_meta?.inventory_updated_at)
                .filter(Boolean) as string[]

            if (timestamps.length > 0) {
                const earliestDate = new Date(Math.min(...timestamps.map(t => new Date(t).getTime()))).toISOString()

                // Fetch line items for ALL needed variants
                const { data: recentLineItems, error: orderError } = await supabase
                    .from('order_line_items')
                    .select(`
                        variant_id, 
                        quantity, 
                        orders!inner(processed_at, created_at)
                    `)
                    .in('variant_id', allNeededVariantIds)
                    .or(`processed_at.gte.${earliestDate},created_at.gte.${earliestDate}`, { foreignTable: 'orders' })

                if (orderError) {
                    console.error('Failed to fetch recent sales:', orderError)
                } else if (recentLineItems) {
                    // Create a helper map for all sales since earliest date
                    // variantId -> Array<{time: number, qty: number}>
                    const salesData: Record<number, { time: number, qty: number }[]> = {}
                    recentLineItems.forEach((item: any) => {
                        const vid = item.variant_id
                        const time = new Date(item.orders?.processed_at || item.orders?.created_at).getTime()
                        if (!salesData[vid]) salesData[vid] = []
                        salesData[vid].push({ time, qty: item.quantity || 0 })
                    })

                    // Now calculate for each tracked product
                    trackedProducts.forEach(product => {
                        const vid = product.variant_id
                        const updateTimeStr = product.internal_meta?.inventory_updated_at
                        if (!updateTimeStr) return
                        const updateTime = new Date(updateTimeStr).getTime()

                        let totalSold = 0
                        const breakdown: any[] = []

                        // 1. Own sales (for standard variants or if custom has direct sales)
                        const ownSales = salesData[vid]
                            ? salesData[vid].filter(s => s.time > updateTime).reduce((sum, s) => sum + s.qty, 0)
                            : 0

                        if (ownSales > 0 || !product.internal_meta?.custom_variant) {
                            totalSold += ownSales
                            breakdown.push({
                                title: 'Direct Sales',
                                qty: ownSales,
                                weight: 1,
                                is_direct: true
                            })

                            // For standard SKUs, also populate their entry in the global map
                            if (!variantSoldMap[vid]) {
                                variantSoldMap[vid] = ownSales
                                variantBreakdownMap[vid] = [{
                                    title: 'Direct Sales',
                                    qty: ownSales,
                                    weight: 1,
                                    is_direct: true
                                }]
                            }
                        }

                        // 2. Linked sales
                        const links = product.internal_meta?.sales_links || []
                        links.forEach((link: any) => {
                            const linkedVid = link.variant_id
                            const weight = link.weight || 1
                            const linkedSales = salesData[linkedVid]
                                ? salesData[linkedVid].filter(s => s.time > updateTime).reduce((sum, s) => sum + s.qty, 0)
                                : 0

                            const weightedSales = linkedSales * weight
                            totalSold += weightedSales
                            breakdown.push({
                                title: link.title,
                                qty: linkedSales,
                                weight: weight,
                                is_link: true
                            })

                            // Populate data for the linked variant itself so it shows in the table as a source
                            if (!variantSoldMap[linkedVid]) {
                                variantSoldMap[linkedVid] = linkedSales
                                variantBreakdownMap[linkedVid] = [{
                                    title: 'Direct Sales',
                                    qty: linkedSales,
                                    weight: 1,
                                    is_direct: true
                                }]
                            }
                        })

                        variantSoldMap[vid] = totalSold
                        variantBreakdownMap[vid] = breakdown
                    })
                }
            }
        }

        const productsWithCalculations = products?.map(p => ({
            ...p,
            order_count: dateRangeOrderCounts[p.variant_id] || 0,
            sold_since_update: variantSoldMap[p.variant_id] || 0,
            sold_breakdown: variantBreakdownMap[p.variant_id] || []
        })) || []

        const response = NextResponse.json({
            success: true,
            products: productsWithCalculations,
            count: products?.length || 0,
        })

        // Prevent any caching
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        response.headers.set('Pragma', 'no-cache')

        return response
    } catch (error: any) {
        console.error('Fetch error:', error)
        return NextResponse.json(
            {
                error: 'Failed to fetch products',
                details: error?.message || 'Unknown error'
            },
            { status: 500 }
        )
    }
}
