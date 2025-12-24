import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

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

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const id = params.id
        const body = await request.json()
        const { manual_cost } = body

        // Validate input - allow null to reset, or number >= 0
        if (manual_cost !== null && (typeof manual_cost !== 'number' || manual_cost < 0)) {
            return NextResponse.json(
                { error: 'Invalid cost value' },
                { status: 400 }
            )
        }

        const supabase = createServiceRoleClient()

        const { data, error } = await supabase
            .from('order_line_items')
            .update({ manual_cost })
            .eq('id', id)
            .select()
            .single()

        if (error) {
            console.error('Failed to update line item cost:', error)
            return NextResponse.json(
                { error: 'Failed to update cost', details: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json({ success: true, data })

    } catch (error: any) {
        console.error('Update cost error:', error)
        return NextResponse.json(
            { error: 'Internal server error', details: error?.message },
            { status: 500 }
        )
    }
}
