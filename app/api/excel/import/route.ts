import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

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

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json(
                { error: 'No file uploaded' },
                { status: 400 }
            )
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(buffer as any)

        const worksheet = workbook.getWorksheet(1)
        if (!worksheet) {
            return NextResponse.json(
                { error: 'Invalid Excel file: No worksheet found' },
                { status: 400 }
            )
        }

        const updates: any[] = []
        const handles: string[] = []

        // Iterate over rows (starting from row 2 to skip header)
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return // Skip header

            // Safe value extraction helper
            const getVal = (idx: number) => {
                const val = row.getCell(idx).value
                return val?.toString() || ''
            }

            // Column mapping (1-based index):
            // 1: Handle, 2: SKU, 3: Title, 4: Cost Price, 5: Notes, 6: Vendor, 7: Purchase Link

            // Adjust indices based on actual template generation
            // Template: Handle, SKU, Title, Cost Price, Notes, Vendor, Purchase Link
            // indices: 1, 2, 3, 4, 5, 6, 7

            const handle = row.getCell(1).text || row.getCell(1).value?.toString()
            if (!handle) return

            const costPriceRaw = row.getCell(4).value
            const notes = row.getCell(5).text || row.getCell(5).value?.toString()
            const vendor = row.getCell(6).text || row.getCell(6).value?.toString()
            const purchaseLink = row.getCell(7).text || row.getCell(7).value?.toString()

            // Parse cost price
            let costPrice: number | undefined
            if (costPriceRaw !== null && costPriceRaw !== undefined && costPriceRaw !== '') {
                const parsed = parseFloat(costPriceRaw.toString())
                if (!isNaN(parsed)) {
                    costPrice = parsed
                }
            }

            updates.push({
                handle,
                changes: {
                    ...(costPrice !== undefined && { cost_price: costPrice }),
                    ...(notes !== undefined && { notes: notes }),
                    ...(vendor !== undefined && { vendor: vendor }),
                    ...(purchaseLink !== undefined && { purchase_link: purchaseLink }),
                }
            })
            handles.push(handle)
        })

        if (updates.length === 0) {
            return NextResponse.json(
                { success: true, count: 0, message: 'No valid data found in file' }
            )
        }

        const supabase = createServiceRoleClient()

        // Fetch existing data for these products to merge internal_meta
        const { data: existingProducts, error: fetchError } = await supabase
            .from('products')
            .select('handle, internal_meta')
            .in('handle', handles)

        if (fetchError) {
            throw fetchError
        }

        // Map existing products for quick lookup
        const productMap = new Map(existingProducts?.map(p => [p.handle, p]) || [])

        // Prepare batch updates
        let updatedCount = 0
        const errors: string[] = []

        // Process updates in chunks to avoid overwhelming the database
        const CHUNK_SIZE = 50
        for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
            const chunk = updates.slice(i, i + CHUNK_SIZE)

            await Promise.all(chunk.map(async (update) => {
                const existing = productMap.get(update.handle)
                if (!existing) {
                    errors.push(`Product not found: ${update.handle}`)
                    return
                }

                const newMeta = {
                    ...existing.internal_meta,
                    ...update.changes
                }

                const { error } = await supabase
                    .from('products')
                    .update({ internal_meta: newMeta })
                    .eq('handle', update.handle)

                if (error) {
                    errors.push(`Failed to update ${update.handle}: ${error.message}`)
                } else {
                    updatedCount++
                }
            }))
        }

        return NextResponse.json({
            success: true,
            count: updatedCount,
            errors: errors.length > 0 ? errors : undefined,
            totalRows: updates.length
        })

    } catch (error: any) {
        console.error('Import error:', error)
        return NextResponse.json(
            { error: 'Failed to process import', details: error.message },
            { status: 500 }
        )
    }
}
