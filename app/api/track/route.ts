import { NextRequest, NextResponse } from 'next/server'
import { createServerClientUntyped } from '@/lib/supabase/client'

/**
 * POST /api/track
 * Tracks user events (view, cart, purchase)
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { session_id, product_variant_id, event_type, event_data = {} } = body

        // Validate required fields
        if (!session_id || !product_variant_id || !event_type) {
            return NextResponse.json(
                { error: 'Missing required fields: session_id, product_variant_id, event_type' },
                { status: 400 }
            )
        }

        // Validate event_type
        if (!['view', 'cart', 'purchase'].includes(event_type)) {
            return NextResponse.json(
                { error: 'Invalid event_type. Must be: view, cart, or purchase' },
                { status: 400 }
            )
        }

        const supabase = createServerClientUntyped()

        // Insert event
        const { data, error } = await supabase
            .from('user_events')
            .insert({
                session_id,
                product_variant_id: parseInt(product_variant_id),
                event_type,
                event_data,
            })
            .select()
            .single()

        if (error) {
            console.error('Event tracking error:', error)
            return NextResponse.json(
                { error: 'Failed to track event', details: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            event: data,
        })
    } catch (error) {
        console.error('Track error:', error)
        return NextResponse.json(
            {
                error: 'Failed to track event',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        )
    }
}
