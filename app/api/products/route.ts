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
            .range(0, 9999) // Explicitly request more rows

        if (error) {
            console.error('Supabase fetch error:', error)
            return NextResponse.json(
                { error: 'Failed to fetch products', details: error.message },
                { status: 500 }
            )
        }

        // Fetch order counts if date range is provided
        const orderCounts: Record<number, number> = {}
        if (startDate && endDate) {
            console.log(`📊 Fetching orders between ${startDate} and ${endDate}`)
            const { data: lineItems, error: orderError } = await supabase
                .from('order_line_items')
                .select('variant_id, quantity, orders!inner(created_at)')
                .gte('orders.created_at', startDate)
                .lte('orders.created_at', endDate)

            if (orderError) {
                console.error('Failed to fetch order stats:', orderError)
            } else if (lineItems) {
                lineItems.forEach((item: any) => {
                    const vid = item.variant_id
                    const qty = item.quantity || 0
                    if (vid) {
                        orderCounts[vid] = (orderCounts[vid] || 0) + qty
                    }
                })
                console.log(`📊 Found order stats for ${Object.keys(orderCounts).length} variants`)
            }
        }

        const productsWithCounts = products?.map(p => ({
            ...p,
            order_count: orderCounts[p.variant_id] || 0
        })) || []

        // Debug: Show how many products returned
        console.log(`📊 Fetched ${products?.length || 0} products from DATABASE`)

        // Check if there are duplicate variant_ids in the response
        const variantIds = products?.map(p => p.variant_id) || []
        const uniqueIds = new Set(variantIds)
        if (variantIds.length !== uniqueIds.size) {
            console.warn(`⚠️ Duplicate variant_ids in database response!`)
        }

        // Debug: Compare with exact count
        const { count: exactCount, error: countErr } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })

        if (!countErr && exactCount !== products?.length) {
            console.warn(`⚠️ COUNT MISMATCH! SELECT returned ${products?.length} but COUNT shows ${exactCount}`)
            console.warn(`   This may indicate Supabase is limiting results or RLS is filtering rows`)
        }

        const response = NextResponse.json({
            success: true,
            products: productsWithCounts,
            count: products?.length || 0,
            exactDbCount: exactCount, // Add this for debugging
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
