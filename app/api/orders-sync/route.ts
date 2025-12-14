import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchShopifyOrders, ShopifyOrder } from '@/lib/shopify'

// --- Helper Functions ---

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

export async function POST(request: NextRequest) {
    try {
        const supabase = createServiceRoleClient()

        // 1. Get Shop Credentials
        // Since this is a private deployment for one shop potentially, we grab the first one
        // In a multi-tenant app, we'd need to know acting shop (e.g. from session or request body)
        const { data: credentials, error: credError } = await supabase
            .from('shop_credentials')
            .select('*')
            .single() // Assuming single store usage for PMS

        if (credError || !credentials) {
            return NextResponse.json({
                error: 'No shop credentials found. Please authenticate the app first.',
                details: credError?.message
            }, { status: 401 })
        }

        const { shop_domain, access_token } = credentials

        console.log(`🔌 Starting Order Sync for ${shop_domain}...`)

        // 2. Fetch Orders from Shopify
        // We could optimize by fetching only since last update, but for now full sync/recent sync
        const orders = await fetchShopifyOrders(shop_domain, access_token)
        console.log(`📦 Fetched ${orders.length} orders`)

        if (orders.length === 0) {
            return NextResponse.json({ success: true, count: 0, message: 'No orders found' })
        }

        // 3. Prepare Data for Database
        const ordersToUpsert = orders.map(order => ({
            shopify_order_id: order.id,
            order_number: order.name,
            email: order.email,
            financial_status: order.financial_status,
            fulfillment_status: order.fulfillment_status,
            total_price: parseFloat(order.total_price),
            subtotal_price: parseFloat(order.subtotal_price),
            total_tax: parseFloat(order.total_tax),
            total_discounts: parseFloat(order.total_discounts),
            currency: order.currency,
            customer_name: order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : null,
            shipping_address: order.shipping_address || null, // JSONB
            processed_at: order.processed_at,
            order_created_at: order.created_at, // Use proper column map
            order_updated_at: order.updated_at
            // created_at / updated_at handled by DB defaults
        }))

        // 4. Save Orders
        const { error: orderError } = await supabase
            .from('orders')
            .upsert(ordersToUpsert, {
                onConflict: 'shopify_order_id',
                ignoreDuplicates: false
            })

        if (orderError) {
            console.error('❌ Failed to save orders:', orderError)
            throw new Error(`Failed to save orders: ${orderError.message}`)
        }

        // 5. Save Line Items
        // Flatten line items from all orders
        const lineItemsToUpsert: any[] = []

        // Need to get internal IDs? 
        // Upsert on 'shopify_order_id' doesn't return internal UUIDs easily in bulk without select
        // But we need internal order_id for line items relation?
        // Actually, schema uses `order_id UUID REFERENCES orders(id)`
        // We must know the UUID of the order we just inserted to link line items.

        // Improved Strategy:
        // Fetch back the orders we just upserted to map shopify_id -> internal_id
        const shopifyOrderIds = orders.map(o => o.id)
        const { data: savedOrders } = await supabase
            .from('orders')
            .select('id, shopify_order_id')
            .in('shopify_order_id', shopifyOrderIds)

        const orderIdMap = new Map(savedOrders?.map(o => [Number(o.shopify_order_id), o.id]))

        for (const order of orders) {
            const internalOrderId = orderIdMap.get(order.id)
            if (!internalOrderId) continue

            for (const item of order.line_items) {
                lineItemsToUpsert.push({
                    order_id: internalOrderId,
                    shopify_line_item_id: item.id,
                    variant_id: item.variant_id,
                    product_id: item.product_id,
                    title: item.title,
                    sku: item.sku,
                    quantity: item.quantity,
                    price: parseFloat(item.price),
                    total_discount: parseFloat(item.total_discount)
                })
            }
        }

        if (lineItemsToUpsert.length > 0) {
            const { error: lineItemError } = await supabase
                .from('order_line_items')
                .upsert(lineItemsToUpsert, {
                    onConflict: 'shopify_line_item_id',
                    ignoreDuplicates: false
                })

            if (lineItemError) {
                console.error('❌ Failed to save line items:', lineItemError)
                // Don't fail the whole request, but log it
            }
        }

        return NextResponse.json({
            success: true,
            synced_orders: orders.length,
            synced_items: lineItemsToUpsert.length,
            message: `Successfully synced ${orders.length} orders`
        })

    } catch (error: any) {
        console.error('Sync error:', error)
        return NextResponse.json(
            { error: 'Failed to sync orders', details: error.message },
            { status: 500 }
        )
    }
}
