import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

// Force dynamic rendering
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

export async function GET(request: NextRequest) {
    try {
        const supabase = createServiceRoleClient()

        // Fetch all products
        const { data: products, error } = await supabase
            .from('products')
            .select('*')
            .order('title', { ascending: true })

        if (error) {
            console.error('Database fetch error:', error)
            return NextResponse.json(
                { error: 'Failed to fetch products for template' },
                { status: 500 }
            )
        }

        // Create workbook and worksheet
        const workbook = new ExcelJS.Workbook()
        const worksheet = workbook.addWorksheet('Inventory Update')

        // Define columns
        worksheet.columns = [
            { header: 'Handle', key: 'handle', width: 25 }, // ID for matching
            { header: 'SKU', key: 'sku', width: 20 },
            { header: 'Product / Variant Title', key: 'title', width: 40 },
            { header: 'Cost Price', key: 'cost_price', width: 15 },
            { header: 'Supplier', key: 'supplier', width: 20 },
            { header: 'Notes', key: 'notes', width: 30 },
            { header: 'Vendor', key: 'vendor', width: 20 },
            { header: 'Purchase Link', key: 'purchase_link', width: 30 },
        ]

        // Style the header row
        worksheet.getRow(1).font = { bold: true }
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        }

        // Add validations/instructions (optional)
        // Add data rows
        products?.forEach(product => {
            const meta = product.internal_meta || {}

            // Determine display title
            const title = product.is_spu
                ? product.title
                : `${product.title} - ${product.option1 || ''} ${product.option2 || ''} ${product.option3 || ''}`.trim()

            worksheet.addRow({
                handle: product.handle, // Using handle as main identifier
                sku: product.sku,
                title: title,
                cost_price: meta.cost_price || '',
                supplier: meta.supplier || '',
                notes: meta.notes || '',
                vendor: meta.vendor || '',
                purchase_link: meta.purchase_link || ''
            })
        })

        // Protect specific columns to encourage editing only correct fields (Optional, but exceljs protection is tricky)
        // For now, we trust the use to edit the correct columns.

        // Write to buffer
        const buffer = await workbook.xlsx.writeBuffer()

        // Return as download
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="inventory_template_${new Date().toISOString().split('T')[0]}.xlsx"`,
            },
        })

    } catch (error: any) {
        console.error('Template generation error:', error)
        return NextResponse.json(
            { error: 'Failed to generate template', details: error.message },
            { status: 500 }
        )
    }
}
