import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchAndTransformShopifyProducts } from '@/lib/shopify'

// 重试辅助函数
async function retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    delay = 2000
): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation()
        } catch (error: any) {
            const isNetworkError =
                error?.message?.includes('network') ||
                error?.message?.includes('TLS') ||
                error?.message?.includes('socket') ||
                error?.code === 'ECONNRESET'

            if (i === maxRetries - 1 || !isNetworkError) {
                throw error
            }

            console.log(`Network error, retry ${i + 1}/${maxRetries}:`, error?.message)
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1)))
        }
    }
    throw new Error('Max retries exceeded')
}

// Create Supabase client with service role key to bypass RLS
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
 * POST /api/sync
 * Syncs Shopify products to Supabase database
 * NOTE: Inventory is manually managed and NOT synced from Shopify
 */
export async function POST(request: NextRequest) {
    try {
        // Use service role key to bypass RLS for upsert operations
        const supabase = createServiceRoleClient()

        // Fetch and transform Shopify data
        console.log('Fetching Shopify products...')
        const transformedProducts = await fetchAndTransformShopifyProducts()
        console.log(`Fetched ${transformedProducts.length} product variants`)

        // Fetch existing products to preserve manual inventory
        const { data: existingProducts } = await supabase
            .from('products')
            .select('variant_id, inventory_quantity, internal_meta')

        const existingMap = new Map(
            existingProducts?.map(p => [
                p.variant_id,
                {
                    internal_meta: p.internal_meta
                }
            ]) || []
        )

        // Prepare products for insertion, preserving existing inventory
        const productsToUpsert = transformedProducts.map(product => {
            const existing = existingMap.get(product.variant_id)

            // Clone existing meta to avoid mutation, preserving all manual data
            const internalMeta = { ...(existing?.internal_meta || {}) }
            // All internal_meta fields (cost_price, supplier, notes, manual_inventory, inventory_updated_at) are preserved

            return {
                variant_id: product.variant_id,
                shopify_product_id: product.shopify_product_id,
                title: product.title,
                handle: product.handle,
                sku: product.sku,
                price: product.price,
                compare_at_price: product.compare_at_price,
                // Update inventory from Shopify
                inventory_quantity: product.inventory_quantity,
                weight: product.weight,
                image_url: product.image_url,
                landing_page_url: product.landing_page_url,
                internal_meta: internalMeta,
            }
        })

        // Debug logging
        console.log(`📦 Preparing to upsert ${productsToUpsert.length} products`)
        console.log('🔍 Sample product data (first product):', JSON.stringify(productsToUpsert[0], null, 2))
        console.log('🔍 Internal meta changes:', productsToUpsert.slice(0, 3).map(p => ({
            variant_id: p.variant_id,
            inventory: p.inventory_quantity,
            internal_meta: p.internal_meta
        })))

        // Check for duplicate variant_ids in the data we're about to upsert
        const variantIds = productsToUpsert.map(p => p.variant_id)
        const uniqueIds = new Set(variantIds)
        if (variantIds.length !== uniqueIds.size) {
            const duplicates = variantIds.filter((id, index) => variantIds.indexOf(id) !== index)
            console.error('❌ DUPLICATE VARIANT IDS DETECTED:', duplicates)
            console.error('   This will cause fewer products to be saved!')
        }

        // 使用重试机制处理网络问题
        console.log('Upserting products to database with retry...')
        const { data, error } = await retryOperation(async () => {
            return await supabase
                .from('products')
                .upsert(productsToUpsert, {
                    onConflict: 'variant_id',
                    ignoreDuplicates: false,
                })
                .select()
        }, 3, 2000)

        if (error) {
            console.error('Supabase upsert error:', error)
            return NextResponse.json(
                { error: 'Failed to sync products', details: error.message || JSON.stringify(error) },
                { status: 500 }
            )
        }

        // Debug: Verify that updates actually happened by comparing input vs output
        console.log('🔍 UPSERT VERIFICATION:')
        if (data && data.length > 0) {
            // Check first 3 products to verify values match what we sent
            const sampleData = data.slice(0, 3)
            const inputSample = productsToUpsert.slice(0, 3)
            console.log('📥 INPUT (what we sent):')
            inputSample.forEach(p => console.log(`   ${p.variant_id}: price=${p.price}, compare_at=${p.compare_at_price}, inv=${p.inventory_quantity}`))
            console.log('📤 OUTPUT (what DB returned):')
            sampleData.forEach(p => console.log(`   ${p.variant_id}: price=${p.price}, compare_at=${p.compare_at_price}, inv=${p.inventory_quantity}`))

            // Check if any values differ (they should match!)
            const mismatches = inputSample.filter((input, i) => {
                const output = sampleData[i]
                return input.price !== output.price ||
                    input.compare_at_price !== output.compare_at_price ||
                    input.inventory_quantity !== output.inventory_quantity
            })
            if (mismatches.length > 0) {
                console.error('❌ MISMATCH DETECTED! Input and output values differ!')
                console.error('   This means the upsert is NOT updating existing rows!')
            } else {
                console.log('✅ Input and output match - upsert is working correctly')
            }
        }

        // Debug: Compare counts
        const syncedCount = data?.length || 0
        const expectedCount = productsToUpsert.length
        if (syncedCount !== expectedCount) {
            console.warn(`⚠️ Count mismatch! Expected: ${expectedCount}, Synced: ${syncedCount}`)
            // Find missing variant_ids
            const syncedIds = new Set(data?.map(p => p.variant_id) || [])
            const missingProducts = productsToUpsert.filter(p => !syncedIds.has(p.variant_id))
            console.warn('❌ Missing products:', missingProducts.map(p => ({ variant_id: p.variant_id, title: p.title })))
        }

        // Verification: Do a SELECT COUNT to verify actual database state
        const { count: dbCount, error: countError } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })

        if (countError) {
            console.error('❌ Count query error:', countError)
        } else {
            console.log(`🔢 Verification: Database now has ${dbCount} products`)
            if (dbCount !== syncedCount) {
                console.warn(`⚠️ VERIFICATION MISMATCH! Synced ${syncedCount} but DB has ${dbCount}`)
            }
        }

        // Check for the specific missing variant IDs
        const testVariantIds = [50652742156578, 50652742189346, 50652742222114, 50652695167266, 50652695068962]
        const { data: testProducts, error: testError } = await supabase
            .from('products')
            .select('variant_id, title')
            .in('variant_id', testVariantIds)

        if (testError) {
            console.error('❌ Test query error:', testError)
        } else {
            console.log(`🔍 Test: Found ${testProducts?.length || 0} of ${testVariantIds.length} test variants in DB`)
            if (testProducts && testProducts.length < testVariantIds.length) {
                const foundIds = new Set(testProducts.map(p => p.variant_id))
                const missing = testVariantIds.filter(id => !foundIds.has(id))
                console.warn('❌ MISSING from DB:', missing)
            } else if (testProducts) {
                console.log('✅ All test variants exist in DB:', testProducts.map(p => ({ id: p.variant_id })))
            }
        }

        console.log(`✅ Successfully synced ${syncedCount} products`)

        // Delete products that exist in DB but not in Shopify
        const shopifyVariantIds = transformedProducts.map(p => p.variant_id)
        console.log('🔍 Checking for products to delete...')

        // Get all variant IDs from database
        const { data: allDbProducts, error: fetchError } = await supabase
            .from('products')
            .select('variant_id')

        if (fetchError) {
            console.error('❌ Error fetching DB products for deletion check:', fetchError)
        } else {
            const dbVariantIds = allDbProducts?.map(p => p.variant_id) || []
            const variantsToDelete = dbVariantIds.filter(id => !shopifyVariantIds.includes(id))

            if (variantsToDelete.length > 0) {
                console.log(`🗑️ Found ${variantsToDelete.length} products to delete (exist in DB but not in Shopify)`)
                console.log('   Variant IDs to delete:', variantsToDelete)

                const { error: deleteError } = await supabase
                    .from('products')
                    .delete()
                    .in('variant_id', variantsToDelete)

                if (deleteError) {
                    console.error('❌ Error deleting products:', deleteError)
                } else {
                    console.log(`✅ Successfully deleted ${variantsToDelete.length} products`)
                }
            } else {
                console.log('✅ No products to delete - DB is in sync with Shopify')
            }
        }

        return NextResponse.json({
            success: true,
            synced: syncedCount,
            message: `Successfully synced ${syncedCount} products from Shopify`,
        })
    } catch (error: any) {
        console.error('Sync error:', error)
        return NextResponse.json(
            {
                error: 'Failed to sync products',
                details: error?.message || 'Unknown error'
            },
            { status: 500 }
        )
    }
}

/**
 * GET /api/sync
 * Returns live Shopify data for comparison (without saving to DB)
 */
export async function GET(request: NextRequest) {
    try {
        const transformedProducts = await fetchAndTransformShopifyProducts()

        return NextResponse.json({
            success: true,
            products: transformedProducts,
            count: transformedProducts.length,
        })
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
