import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
 * GET /api/weight-sync
 * Fetches weight data from individual product endpoints sequentially
 * Returns weight data for comparison with database
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = createServiceRoleClient()

        // Get mode parameter (empty or all)
        const searchParams = request.nextUrl.searchParams
        const mode = searchParams.get('mode') || 'all'  // Default to 'all'

        // 1. Fetch all products from database to get handles
        console.log('📦 Fetching product handles from database...')
        const { data: dbProducts, error: fetchError } = await supabase
            .from('products')
            .select('handle, variant_id, weight, shopify_product_id')
            .order('shopify_product_id')

        if (fetchError) {
            console.error('❌ Error fetching products:', fetchError)
            throw fetchError
        }

        console.log(`✅ Found ${dbProducts?.length || 0} variants in database`)

        // 2. Filter products based on mode
        let productsToProcess = dbProducts || []
        if (mode === 'empty') {
            // Only process products with null/empty weight
            productsToProcess = dbProducts?.filter(p => p.weight === null || p.weight === undefined) || []
            console.log(`📋 Mode: empty - Found ${productsToProcess.length} products with null weight (out of ${dbProducts?.length || 0} total)`)
        } else {
            console.log(`📋 Mode: all - Processing all ${productsToProcess.length} products`)
        }

        // 3. Get unique handles from filtered products
        const uniqueHandles = Array.from(new Set(productsToProcess.map(p => p.handle)))
        console.log(`📋 Processing ${uniqueHandles.length} unique products`)

        // 3. Sequential fetch with progress tracking
        const weightData: Array<{ variant_id: number; weight: number | null }> = []
        let processed = 0

        for (const handle of uniqueHandles) {
            try {
                processed++
                console.log(`🔄 [${processed}/${uniqueHandles.length}] Fetching: ${handle}`)

                const response = await fetch(
                    `https://yooppee.com/products/${handle}.json`,
                    {
                        headers: {
                            'User-Agent': 'Mozilla/5.0',
                        }
                    }
                )

                if (!response.ok) {
                    console.warn(`⚠️ Failed to fetch ${handle}: ${response.status}`)
                    continue
                }

                const data = await response.json()

                // Extract grams from each variant
                if (data.product && data.product.variants) {
                    for (const variant of data.product.variants) {
                        weightData.push({
                            variant_id: variant.id,
                            weight: variant.grams || null  // Use grams field directly (unit: grams)
                        })
                    }
                }

                // Small delay to avoid rate limiting (100ms)
                await new Promise(resolve => setTimeout(resolve, 100))

            } catch (error: any) {
                console.error(`❌ Error fetching ${handle}:`, error.message)
                // Continue with next product
                continue
            }
        }

        console.log(`✅ Successfully fetched weight data for ${weightData.length} variants`)

        // 4. Compare with filtered products and return only products with differences
        const productsWithChanges = productsToProcess.filter(dbProduct => {
            const shopifyWeight = weightData.find(w => w.variant_id === dbProduct.variant_id)
            if (!shopifyWeight) return false

            const dbWeight = dbProduct.weight
            const newWeight = shopifyWeight.weight

            // Consider as changed if values differ
            return dbWeight !== newWeight
        })

        console.log(`📊 Found ${productsWithChanges.length} products with weight changes`)

        // 5. Create merged data with weight updates (only for processed products)
        const mergedProducts = productsToProcess.map(dbProduct => {
            const shopifyWeight = weightData.find(w => w.variant_id === dbProduct.variant_id)
            return {
                ...dbProduct,
                shopify_weight: shopifyWeight?.weight || null
            }
        }) || []

        return NextResponse.json({
            success: true,
            products: mergedProducts,
            totalProducts: uniqueHandles.length,
            totalVariants: weightData.length,
            changesCount: productsWithChanges.length,
            message: `Fetched weight data for ${uniqueHandles.length} products (${weightData.length} variants), found ${productsWithChanges.length} with changes`
        })

    } catch (error: any) {
        console.error('❌ Weight sync error:', error)
        return NextResponse.json(
            {
                error: 'Failed to fetch weight data',
                details: error?.message || 'Unknown error'
            },
            { status: 500 }
        )
    }
}

/**
 * POST /api/weight-sync
 * Updates weight data in database
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = createServiceRoleClient()

        // Get mode parameter (empty or all)
        const searchParams = request.nextUrl.searchParams
        const mode = searchParams.get('mode') || 'all'  // Default to 'all'

        // Fetch weight data (reuse GET logic but with parallelization)
        console.log('📦 Fetching latest weight data from Shopify...')
        const { data: dbProducts } = await supabase
            .from('products')
            .select('handle, variant_id, weight')
            .order('shopify_product_id')

        // Filter products based on mode
        let productsToProcess = dbProducts || []
        if (mode === 'empty') {
            // Only process products with null/empty weight
            productsToProcess = dbProducts?.filter(p => p.weight === null || p.weight === undefined) || []
            console.log(`📋 Mode: empty - Processing ${productsToProcess.length} products with null weight (out of ${dbProducts?.length || 0} total)`)
        } else {
            console.log(`📋 Mode: all - Processing all ${productsToProcess.length} products`)
        }

        const uniqueHandles = Array.from(new Set(productsToProcess.map(p => p.handle)))
        console.log(`📋 Processing ${uniqueHandles.length} unique products in parallel...`)

        const weightData: Array<{ variant_id: number; weight: number | null }> = []

        // Parallel fetch with batching to avoid overwhelming the server
        const BATCH_SIZE = 10 // Process 10 products at a time
        for (let i = 0; i < uniqueHandles.length; i += BATCH_SIZE) {
            const batch = uniqueHandles.slice(i, i + BATCH_SIZE)
            console.log(`🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(uniqueHandles.length / BATCH_SIZE)}`)

            const batchPromises = batch.map(async (handle) => {
                try {
                    const response = await fetch(
                        `https://yooppee.com/products/${handle}.json`,
                        {
                            headers: {
                                'User-Agent': 'Mozilla/5.0',
                            }
                        }
                    )

                    if (!response.ok) return []

                    const data = await response.json()

                    if (data.product && data.product.variants) {
                        return data.product.variants.map((variant: any) => ({
                            variant_id: variant.id,
                            weight: variant.grams || null
                        }))
                    }
                    return []
                } catch (error) {
                    console.error(`❌ Error fetching ${handle}:`, error)
                    return []
                }
            })

            const batchResults = await Promise.all(batchPromises)
            weightData.push(...batchResults.flat())
        }

        console.log(`✅ Fetched weight for ${weightData.length} variants`)

        // Filter to only products with actual weight differences
        const productsToUpdate = productsToProcess.filter(dbProduct => {
            const shopifyWeight = weightData.find(w => w.variant_id === dbProduct.variant_id)
            if (!shopifyWeight) return false

            const dbWeight = dbProduct.weight
            const newWeight = shopifyWeight.weight

            // Only update if values differ
            return dbWeight !== newWeight
        })

        console.log(`📊 Found ${productsToUpdate.length} products with weight differences (out of ${weightData.length} fetched)`)

        // Update database in batches for better performance - ONLY for products with differences
        let updatedCount = 0
        const UPDATE_BATCH_SIZE = 50

        for (let i = 0; i < productsToUpdate.length; i += UPDATE_BATCH_SIZE) {
            const batch = productsToUpdate.slice(i, i + UPDATE_BATCH_SIZE)

            const updatePromises = batch.map(async (dbProduct) => {
                const shopifyWeight = weightData.find(w => w.variant_id === dbProduct.variant_id)
                if (!shopifyWeight) return

                const { error } = await supabase
                    .from('products')
                    .update({ weight: shopifyWeight.weight })
                    .eq('variant_id', dbProduct.variant_id)

                if (!error) {
                    updatedCount++
                }
            })

            await Promise.all(updatePromises)
        }

        console.log(`✅ Updated ${updatedCount} products`)

        return NextResponse.json({
            success: true,
            updated: updatedCount,
            message: `Successfully updated weight for ${updatedCount} products`
        })

    } catch (error: any) {
        console.error('❌ Weight update error:', error)
        return NextResponse.json(
            {
                error: 'Failed to update weight data',
                details: error?.message || 'Unknown error'
            },
            { status: 500 }
        )
    }
}
