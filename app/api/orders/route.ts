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

        // 1. Fetch Orders with Line Items
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

        // 2. Fetch SKU Mappings
        const { data: mappings } = await supabase
            .from('sku_mappings')
            .select('input_sku, target_variant_id')

        const skuMappingMap = new Map<string, number>()
        if (mappings) {
            mappings.forEach((m: any) => {
                if (m.input_sku && m.target_variant_id) {
                    skuMappingMap.set(m.input_sku, Number(m.target_variant_id))
                }
            })
        }

        // 3. Collect all Variant IDs (Original + Mapped)
        const variantIds = new Set<number>()
        orders.forEach((order: any) => {
            order.order_line_items?.forEach((item: any) => {
                // If there's a mapping, use that variant ID
                if (item.sku && skuMappingMap.has(item.sku)) {
                    variantIds.add(skuMappingMap.get(item.sku)!)
                }
                // Also add original variant_id as fallback/default
                if (item.variant_id) {
                    variantIds.add(item.variant_id)
                }
            })
        })

        // 4. Fetch Products (Images, Costs) for all collected variants
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

        // 5. Enrich Line Items with Mapped/Original Data
        const enrichedOrders = orders.map((order: any) => {
            let totalOrderCost = 0

            const enrichedLineItems = order.order_line_items.map((item: any) => {
                // Determine effective variant ID: Mapped -> Original
                let effectiveVariantId = item.variant_id
                let isMapped = false

                if (item.sku && skuMappingMap.has(item.sku)) {
                    effectiveVariantId = skuMappingMap.get(item.sku)!
                    isMapped = true
                }

                // Look up product data using the effective ID
                const productData = productMap.get(effectiveVariantId)

                const inventoryCost = productData?.cost_price || 0
                const manualCost = item.manual_cost // DB manual override

                // Final cost logic: Manual > Inventory
                const finalCost = manualCost !== null ? manualCost : inventoryCost

                const quantity = item.quantity || 0
                totalOrderCost += (Number(finalCost) * quantity)

                return {
                    ...item,
                    image_url: productData?.image_url || null, // Use mapped image
                    cost: finalCost,
                    is_manual_cost: manualCost !== null,
                    effective_variant_id: effectiveVariantId, // Useful for frontend debugging/linking
                    is_mapped: isMapped
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
