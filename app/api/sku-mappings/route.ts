import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

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
        const body = await request.json()
        const { input_sku, target_variant_id } = body

        if (!input_sku || !target_variant_id) {
            return NextResponse.json(
                { error: 'Missing required fields: input_sku, target_variant_id' },
                { status: 400 }
            )
        }

        const supabase = createServiceRoleClient()

        // Upsert mapping
        const { data, error } = await supabase
            .from('sku_mappings')
            .upsert(
                {
                    input_sku,
                    target_variant_id,
                    updated_at: new Date().toISOString()
                },
                { onConflict: 'input_sku' }
            )
            .select()
            .single()

        if (error) {
            console.error('Error saving SKU mapping:', error)
            return NextResponse.json(
                { error: 'Failed to save mapping', details: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json({ success: true, mapping: data })

    } catch (error: any) {
        console.error('API Error:', error)
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        )
    }
}
