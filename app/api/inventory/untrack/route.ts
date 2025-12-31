import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
    try {
        const { shopifyProductIds, variantIds } = await request.json()

        if ((!shopifyProductIds || !Array.isArray(shopifyProductIds)) &&
            (!variantIds || !Array.isArray(variantIds))) {
            return NextResponse.json({ error: 'Invalid IDs provided' }, { status: 400 })
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        )

        // Build the query to fetch variants to untrack
        let query = supabase.from('products').select('variant_id, internal_meta')

        if (shopifyProductIds?.length > 0 && variantIds?.length > 0) {
            query = query.or(`shopify_product_id.in.(${shopifyProductIds.join(',')}),variant_id.in.(${variantIds.join(',')})`)
        } else if (shopifyProductIds?.length > 0) {
            query = query.in('shopify_product_id', shopifyProductIds)
        } else if (variantIds?.length > 0) {
            query = query.in('variant_id', variantIds)
        } else {
            return NextResponse.json({ success: true, count: 0 })
        }

        const { data: variants, error: fetchError } = await query

        if (fetchError) throw fetchError

        if (!variants || variants.length === 0) {
            return NextResponse.json({ success: true, count: 0 })
        }

        // Separate custom vs standard variants
        const customVids = variants
            .filter(v => v.internal_meta?.custom_variant === true)
            .map(v => v.variant_id)

        const standardVids = variants
            .filter(v => v.internal_meta?.custom_variant !== true)
            .map(v => v.variant_id)

        // 1. Delete custom variants (offline entries)
        if (customVids.length > 0) {
            const { error: delError } = await supabase
                .from('products')
                .delete()
                .in('variant_id', customVids)
            if (delError) throw delError
        }

        // 2. Reset status for standard variants (Merging metadata to avoid data loss)
        if (standardVids.length > 0) {
            for (const v of variants.filter(v => standardVids.includes(v.variant_id))) {
                const { error: upError } = await supabase
                    .from('products')
                    .update({
                        internal_meta: {
                            ...(v.internal_meta || {}),
                            is_tracked_inventory: false
                        }
                    })
                    .eq('variant_id', v.variant_id)
                if (upError) throw upError
            }
        }

        return NextResponse.json({
            success: true,
            removed_custom: customVids.length,
            reset_standard: standardVids.length
        })
    } catch (error: any) {
        console.error('Untrack batch error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
