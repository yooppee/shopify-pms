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

        return NextResponse.json({ orders })
    } catch (error: any) {
        console.error('Fetch orders error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch orders', details: error?.message },
            { status: 500 }
        )
    }
}
