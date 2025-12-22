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

/**
 * GET /api/listings
 * Fetches all listing drafts from database
 */
export async function GET() {
    try {
        const supabase = createServiceRoleClient()

        const { data: listings, error } = await supabase
            .from('listing_drafts')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Failed to fetch listings:', error)
            return NextResponse.json(
                { error: 'Failed to fetch listings', details: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            listings: listings || [],
            count: listings?.length || 0,
        })
    } catch (error: any) {
        console.error('Fetch listings error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch listings', details: error?.message },
            { status: 500 }
        )
    }
}

/**
 * POST /api/listings
 * Create a new listing draft
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = createServiceRoleClient()
        const body = await request.json()

        // Extract draft data from body
        const draftData = {
            title: body.title || '',
            price: body.price || 0,
            compare_at_price: body.compare_at_price || null,
            cost: body.cost || null,
            weight: body.weight || null,
            note: body.note || '',
            purchase_link: body.purchase_link || '',
            variants: body.variants || [],
            options: body.options || [],
        }

        // Enforce IDs on variants if missing (Safety Net)
        if (draftData.variants && Array.isArray(draftData.variants)) {
            draftData.variants = draftData.variants.map((v: any) => {
                if (!v.id) {
                    // Simple random ID generator for server-side safety
                    v.id = crypto.randomUUID()
                    console.log('DEBUG API: Generated missing variant ID:', v.id)
                }
                return v
            })
        }

        console.log('DEBUG API: Received variants count:', draftData.variants.length)
        if (draftData.variants.length > 0) {
            console.log('DEBUG API: First variant ID:', draftData.variants[0].id)
            console.log('DEBUG API: First variant full:', JSON.stringify(draftData.variants[0], null, 2))
        }

        const insertPayload = {
            product_id: null,
            draft_data: draftData,
            status: 'draft',
        }

        console.log('📝 Inserting listing with payload:', JSON.stringify(insertPayload, null, 2))

        const { data, error } = await supabase
            .from('listing_drafts')
            .insert(insertPayload)
            .select()
            .single()

        if (error) {
            console.error('Failed to create listing:', error)
            console.error('Error details:', JSON.stringify(error, null, 2))
            return NextResponse.json(
                { error: 'Failed to create listing', details: error.message, code: error.code },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            listing: data,
        })
    } catch (error: any) {
        console.error('Create listing error:', error)
        return NextResponse.json(
            { error: 'Failed to create listing', details: error?.message },
            { status: 500 }
        )
    }
}

/**
 * PATCH /api/listings
 * Update a listing draft
 */
export async function PATCH(request: NextRequest) {
    try {
        const supabase = createServiceRoleClient()
        const body = await request.json()

        const { id, ...updates } = body

        if (!id) {
            return NextResponse.json(
                { error: 'Missing listing id' },
                { status: 400 }
            )
        }

        // Get existing draft data first
        const { data: existing, error: fetchError } = await supabase
            .from('listing_drafts')
            .select('draft_data')
            .eq('id', id)
            .single()

        if (fetchError) {
            console.error('Failed to fetch existing listing:', fetchError)
            return NextResponse.json(
                { error: 'Listing not found', details: fetchError.message },
                { status: 404 }
            )
        }

        // Merge updates into existing draft_data
        const updatedDraftData = {
            ...existing.draft_data,
            ...updates,
        }

        const { data, error } = await supabase
            .from('listing_drafts')
            .update({ draft_data: updatedDraftData })
            .eq('id', id)
            .select()
            .single()

        if (error) {
            console.error('Failed to update listing:', error)
            return NextResponse.json(
                { error: 'Failed to update listing', details: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            listing: data,
        })
    } catch (error: any) {
        console.error('Update listing error:', error)
        return NextResponse.json(
            { error: 'Failed to update listing', details: error?.message },
            { status: 500 }
        )
    }
}

/**
 * DELETE /api/listings
 * Delete a listing draft
 */
export async function DELETE(request: NextRequest) {
    try {
        const supabase = createServiceRoleClient()
        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) {
            return NextResponse.json(
                { error: 'Missing listing id' },
                { status: 400 }
            )
        }

        const { error } = await supabase
            .from('listing_drafts')
            .delete()
            .eq('id', id)

        if (error) {
            console.error('Failed to delete listing:', error)
            return NextResponse.json(
                { error: 'Failed to delete listing', details: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: 'Listing deleted successfully',
        })
    } catch (error: any) {
        console.error('Delete listing error:', error)
        return NextResponse.json(
            { error: 'Failed to delete listing', details: error?.message },
            { status: 500 }
        )
    }
}
