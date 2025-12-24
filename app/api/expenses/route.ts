import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ExpenseRecord } from '@/components/expenses/generic-expense-table'

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
 * GET /api/expenses
 * Helper to fetch expenses by type or all
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = createServiceRoleClient()
        const { searchParams } = new URL(request.url)
        const type = searchParams.get('type')

        let query = supabase.from('expenses').select('*')

        if (type) {
            query = query.eq('type', type)
        }

        const { data, error } = await query

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // Map database fields (snake_case) to frontend fields (camelCase)
        const mappedData = data?.map(row => ({
            id: row.id,
            date: row.date,
            item: row.item,
            amountRMB: Number(row.amount_rmb),
            amountUSD: Number(row.amount_usd),
            person: row.person,
            parentId: row.parent_id,
            isGroup: row.is_group,
            parentId: row.parent_id,
            isGroup: row.is_group,
            lastModified: row.last_modified ? new Date(row.last_modified) : null,
            lastModifiedColumn: row.last_modified_column,
            // type is internal
        })) || []

        return NextResponse.json({
            success: true,
            data: mappedData
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

/**
 * POST /api/expenses
 * Save expenses for a specific type.
 * Request Body: { type: 'procurement', expenses: [...] }
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = createServiceRoleClient()
        const body = await request.json()
        const { type, expenses } = body

        if (!type || !expenses) {
            return NextResponse.json({ error: 'Missing type or expenses' }, { status: 400 })
        }

        // Helper to flatten hierarchy
        const flattenExpenses = (records: ExpenseRecord[], parentId: string | null = null): any[] => {
            let flat: any[] = []
            for (const r of records) {
                flat.push({
                    id: r.id,
                    date: r.date,
                    item: r.item,
                    amount_rmb: r.amountRMB,
                    amount_usd: r.amountUSD,
                    person: r.person,
                    type: type,
                    parent_id: parentId,
                    parent_id: parentId,
                    is_group: r.isGroup || false,
                    last_modified: r.lastModified,
                    last_modified_column: r.lastModifiedColumn
                })
                if (r.children && r.children.length > 0) {
                    flat = flat.concat(flattenExpenses(r.children, r.id))
                }
            }
            return flat
        }

        // Prepare payload by flattening
        const payload = flattenExpenses(expenses)

        // Strategy: 
        // 1. Delete all for this type that are NOT in the new list (handle deletions)
        // 2. Upsert the new list

        const currentIds = payload.map((p: any) => p.id)

        // Delete removed records
        if (currentIds.length > 0) {
            await supabase
                .from('expenses')
                .delete()
                .eq('type', type)
                .not('id', 'in', `(${currentIds.join(',')})`) // careful with syntax
        } else {
            // If list is empty, delete all for type
            await supabase.from('expenses').delete().eq('type', type)
        }

        // Actually, supabase .not('id', 'in', array) works better
        const { error: deleteError } = await supabase
            .from('expenses')
            .delete()
            .eq('type', type)
            .not('id', 'in', `(${currentIds.join(',')})`)

        // Wait, not('id', 'in', ...) expects a parenthesis string for raw filter? 
        // Docs say .not('column', 'in', ['val1', 'val2'])
        // Let's use filter syntax if possible or just use logic:
        // Delete all then insert is risky? No transaction support via JS client easily.
        // Better: Fetch existing IDs, calculate diff, delete diff.

        const { data: existing } = await supabase.from('expenses').select('id').eq('type', type)
        const existingIds = existing?.map(r => r.id) || []
        const toDelete = existingIds.filter(id => !currentIds.includes(id))

        if (toDelete.length > 0) {
            await supabase.from('expenses').delete().in('id', toDelete)
        }

        // Upsert new data
        if (payload.length > 0) {
            const { error: upsertError } = await supabase
                .from('expenses')
                .upsert(payload)

            if (upsertError) throw upsertError
        }

        return NextResponse.json({ success: true })

    } catch (error: any) {
        console.error('Save expenses error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
