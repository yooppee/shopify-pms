import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

// --- Helper Functions ---

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

function verifyHmac(query: URLSearchParams, apiSecret: string) {
    const hmac = query.get('hmac')
    if (!hmac) return false

    // Sort keys just like Shopify wants
    const map = new Map<string, string>()
    query.forEach((value, key) => {
        if (key !== 'hmac') {
            map.set(key, value)
        }
    })

    const sortedKeys = Array.from(map.keys()).sort()
    const message = sortedKeys.map(key => `${key}=${map.get(key)}`).join('&')

    const generatedHmac = crypto
        .createHmac('sha256', apiSecret)
        .update(message)
        .digest('hex')

    // Timing-safe comparison usually recommended
    return generatedHmac === hmac
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const shop = searchParams.get('shop')
    const code = searchParams.get('code')
    const hmac = searchParams.get('hmac')

    const API_KEY = process.env.SHOPIFY_API_KEY
    const API_SECRET = process.env.SHOPIFY_API_SECRET
    const APP_URL = process.env.SHOPIFY_APP_URL

    if (!API_KEY || !API_SECRET || !APP_URL) {
        return NextResponse.json({ error: 'Missing Shopify configuration' }, { status: 500 })
    }

    if (!shop || !code || !hmac) {
        return NextResponse.json({ error: 'Missing callback parameters' }, { status: 400 })
    }

    console.log(`🔙 OAuth Callback received for shop: ${shop}`)

    // 1. Verify HMAC
    if (!verifyHmac(searchParams, API_SECRET)) {
        console.error('❌ HMAC verification failed')
        return NextResponse.redirect(`${APP_URL}/app?error=hmac_verification_failed`)
    }

    try {
        // 2. Exchange code for access token
        const accessTokenUrl = `https://${shop}/admin/oauth/access_token`
        const tokenResponse = await fetch(accessTokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                client_id: API_KEY,
                client_secret: API_SECRET,
                code: code
            })
        })

        const tokenData = await tokenResponse.json()
        if (!tokenData.access_token) {
            console.error('❌ Failed to get access token:', tokenData)
            return NextResponse.redirect(`${APP_URL}/app?error=token_exchange_failed`)
        }

        const accessToken = tokenData.access_token
        console.log('✅ Access Token acquired')

        // 3. Save to Database
        const supabase = createServiceRoleClient()

        // Check if exists
        const { data: existing } = await supabase
            .from('shop_credentials')
            .select('id')
            .eq('shop_domain', shop)
            .single()

        let dbError
        if (existing) {
            // Update
            const { error } = await supabase
                .from('shop_credentials')
                .update({
                    access_token: accessToken,
                    scopes: tokenData.scope,
                    updated_at: new Date().toISOString()
                })
                .eq('shop_domain', shop)
            dbError = error
        } else {
            // Insert
            const { error } = await supabase
                .from('shop_credentials')
                .insert({
                    shop_domain: shop,
                    access_token: accessToken,
                    scopes: tokenData.scope
                })
            dbError = error
        }

        if (dbError) {
            console.error('❌ Database error:', dbError)
            return NextResponse.redirect(`${APP_URL}/app?error=db_save_failed`)
        }

        console.log('💾 Credentials saved to database')

        // 4. Redirect to App Landing Page
        return NextResponse.redirect(`${APP_URL}/app?success=true&shop=${shop}`)

    } catch (error) {
        console.error('SERVER ERROR in OAuth:', error)
        return NextResponse.redirect(`${APP_URL}/app?error=server_error`)
    }
}
