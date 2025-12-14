import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

        // 1. Check DB for credentials
        const { data: credentials, error: dbError } = await supabase
            .from('shop_credentials')
            .select('*')
            .single()

        if (dbError || !credentials) {
            return NextResponse.json({
                authenticated: false,
                error: 'No shop credentials found in database.'
            })
        }

        const { shop_domain, access_token } = credentials

        // 2. Verify Token Validity by making a lightweight request to Shopify
        const shopUrl = `https://${shop_domain}/admin/api/2024-01/shop.json`
        const response = await fetch(shopUrl, {
            headers: {
                'X-Shopify-Access-Token': access_token,
                'Content-Type': 'application/json'
            }
        })

        if (!response.ok) {
            return NextResponse.json({
                authenticated: false,
                shop: shop_domain,
                error: `Token verification failed: ${response.status} ${response.statusText}`
            })
        }

        const shopData = await response.json()

        return NextResponse.json({
            authenticated: true,
            shop: shop_domain,
            shopName: shopData.shop?.name
        })

    } catch (error: any) {
        console.error('Status check error:', error)
        return NextResponse.json({
            authenticated: false,
            error: error.message || 'Internal Server Error'
        }, { status: 500 })
    }
}
