import { NextRequest, NextResponse } from 'next/server'
import { createServerClientUntyped } from '@/lib/supabase/client'
import { createClient } from '@supabase/supabase-js'

/**
 * DELETE /api/products
 * Deletes products by variant IDs
 */
export async function DELETE(request: NextRequest) {
    console.log('🔍 DELETE /api/products/delete called')
    try {
        const body = await request.json()
        console.log('📦 Request body:', body)
        const { variantIds } = body

        if (!variantIds || !Array.isArray(variantIds) || variantIds.length === 0) {
            console.error('❌ Invalid variantIds:', variantIds)
            return NextResponse.json(
                { error: 'Missing or invalid variantIds array' },
                { status: 400 }
            )
        }

        console.log('✅ Received variantIds:', variantIds)

        console.log('🔑 Checking environment variables...')
        console.log('   SUPABASE_URL exists:', !!process.env.NEXT_PUBLIC_SUPABASE_URL)
        console.log('   SERVICE_ROLE_KEY exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error('❌ SUPABASE_SERVICE_ROLE_KEY is missing in environment variables')
            return NextResponse.json(
                { error: 'Server misconfiguration: Missing service role key' },
                { status: 500 }
            )
        }

        console.log('🔗 Creating Supabase client with service role...')
        // Use service role key to bypass RLS policies
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                }
            }
        )

        console.log('🗑️ Executing delete query for variant IDs:', variantIds)
        const { data, error } = await supabase
            .from('products')
            .delete()
            .in('variant_id', variantIds)
            .select()

        if (error) {
            console.error('❌ Supabase delete error:', error)
            return NextResponse.json(
                { error: 'Failed to delete products', details: error.message },
                { status: 500 }
            )
        }

        console.log(`✅ Successfully deleted ${data?.length || 0} products`)
        console.log('   Deleted data:', data)

        return NextResponse.json({
            success: true,
            deleted: data?.length || 0,
            message: `Successfully deleted ${data?.length || 0} products`,
        })
    } catch (error: any) {
        console.error('❌ Delete error (catch block):', error)
        console.error('   Error stack:', error?.stack)
        return NextResponse.json(
            {
                error: 'Failed to delete products',
                details: error?.message || 'Unknown error'
            },
            { status: 500 }
        )
    }
}
